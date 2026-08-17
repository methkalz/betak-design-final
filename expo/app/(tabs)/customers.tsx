import { useRouter } from 'expo-router';
import { Plus, Search, Users } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { AppText, Card, EmptyState, IconButton, Row } from '@/components/ui';
import { font, palette, radius, spacing } from '@/constants/theme';
import { projectFinance } from '@/hooks/selectors';
import { money, phone } from '@/lib/format';
import { digitsOnly } from '@/lib/phone';
import { useStore } from '@/providers/store';

export default function CustomersScreen() {
  const { db } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState<string>('');

  const list = useMemo(() => {
    const q = query.trim();
    // البحث بالرقم يقارن الأرقام وحدها: المخزَّن قد يكون 972… والمستخدم
    // يكتب 052 أو 052-644 - ولو قارنّا النصّين لخرجت القائمة فارغة فأنشأ
    // الأدمن زبونًا مكرّرًا
    const qd = digitsOnly(q);
    return db.customers
      .filter((c) => !c.archivedAt)
      .filter(
        (c) =>
          !q ||
          c.fullName.includes(q) ||
          c.city.includes(q) ||
          (qd.length > 0 && digitsOnly(c.phone).includes(qd.replace(/^0/, ''))),
      );
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
            /* بطاقة هادئة: هوية على اليمين، رقم واحد على اليسار في عمود
               ثابت، وسطر حالة يظهر عند وجود مستحق فقط. الشارات الأربع
               السابقة (المستحق، عدد المشاريع، تفضيلان) كانت تتنافس على
               النظرة نفسها بلا أن يقرأها أحد. */
            <Card onPress={() => router.push(`/customer/${item.id}`)} style={{ padding: spacing.xl }}>
              <Row gap={spacing.md} align="center">
                <Avatar id={item.id} name={item.fullName} size={46} />
                <View style={{ flex: 1 }}>
                  <AppText variant="heading" numberOfLines={1} style={{ fontSize: 16.5 }}>
                    {item.fullName}
                  </AppText>
                  <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                    {item.city} • {phone(item.phone)}
                  </AppText>
                </View>
                <View style={{ alignItems: 'flex-start' }}>
                  {value > 0 ? (
                    <>
                      <AppText variant="number" style={{ fontSize: 17 }}>
                        {money(value)}
                      </AppText>
                      <AppText variant="caption" color={palette.muted}>
                        {projects.length} مشروع
                      </AppText>
                    </>
                  ) : (
                    <AppText variant="caption" color={palette.muted}>
                      بلا مشاريع بعد
                    </AppText>
                  )}
                </View>
              </Row>

              {due > 0 && (
                <Row gap={6} style={{ marginTop: spacing.md }}>
                  <View style={styles.dueDot} />
                  <AppText variant="caption" color={palette.terracotta}>
                    متبقٍ للتحصيل {money(due)}
                  </AppText>
                </Row>
              )}
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

const styles = StyleSheet.create({
  dueDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.terracotta },
});
