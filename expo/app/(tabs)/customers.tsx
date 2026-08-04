import { useRouter } from 'expo-router';
import { Plus, Search, UserRound, Users } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, EmptyState, IconButton, Pill, Row } from '@/components/ui';
import { font, palette, radius, spacing } from '@/constants/theme';
import { projectFinance } from '@/hooks/selectors';
import { initials, money } from '@/lib/format';
import { useStore } from '@/providers/store';

export default function CustomersScreen() {
  const { db } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState<string>('');

  const list = useMemo(() => {
    const q = query.trim();
    return db.customers
      .filter((c) => !c.archivedAt)
      .filter((c) => !q || c.fullName.includes(q) || c.phone.includes(q) || c.city.includes(q));
  }, [db.customers, query]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.ivory, paddingTop: insets.top + spacing.sm }}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        <Row justify="space-between">
          <AppText variant="title">الزبائن</AppText>
          <IconButton onPress={() => router.push('/customer/new')} bg={palette.olive}>
            <Plus size={22} color={palette.ivory} />
          </IconButton>
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
            placeholder="ابحث بالاسم أو الهاتف أو البلدة"
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
      </View>

      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const projects = db.projects.filter((p) => p.customerId === item.id);
          const value = projects.reduce((s, p) => s + projectFinance(db, p.id).totalAgorot, 0);
          const due = projects.reduce((s, p) => s + projectFinance(db, p.id).dueAgorot, 0);
          return (
            <Card onPress={() => router.push(`/customer/${item.id}`)}>
              <Row gap={spacing.md}>
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: palette.sageSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AppText variant="label" color={palette.oliveDark}>
                    {initials(item.fullName)}
                  </AppText>
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="heading">{item.fullName}</AppText>
                  <AppText variant="caption" color={palette.muted}>
                    {item.city} • {item.phone}
                  </AppText>
                </View>
                <View style={{ alignItems: 'flex-start', gap: 4 }}>
                  <AppText variant="label">{money(value)}</AppText>
                  {due > 0 ? (
                    <Pill
                      label={`متبقٍ ${money(due)}`}
                      bg={palette.terracottaSoft}
                      fg={palette.terracotta}
                      small
                    />
                  ) : (
                    <Pill label="مسدد" bg={palette.successSoft} fg={palette.success} small />
                  )}
                </View>
              </Row>
              <Row gap={spacing.sm} style={{ marginTop: spacing.md }} wrap>
                <Pill
                  label={`${projects.length} مشروع`}
                  bg={palette.ivoryDeep}
                  fg={palette.muted}
                  small
                  icon={<UserRound size={12} color={palette.muted} />}
                />
                {item.preferences.slice(0, 2).map((p) => (
                  <Pill key={p} label={p} bg={palette.sand} fg={palette.oliveDark} small />
                ))}
              </Row>
            </Card>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon={<Users size={28} color={palette.olive} />}
            title="لا يوجد زبائن"
            body="أضف أول زبون لتبدأ أول مشروع."
          />
        }
      />
    </View>
  );
}
