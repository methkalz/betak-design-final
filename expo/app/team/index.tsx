/**
 * الطاقم - قائمة حسابات المعرض.
 *
 * مرتّبة بالدور لا بالاسم: الأدمن يسأل «من الخيّاطون؟» لا «أين فلان؟»،
 * والبحث عن اسم بعينه في معرضٍ من عشرة أشخاص لا يحتاج قائمة أبجدية.
 * وتحت كل اسم رقمٌ واحد فقط - ما بين يديه الآن - لأن ذلك وحده ما يقرّر
 * لمن تُسند المهمة التالية.
 */
import { useRouter } from 'expo-router';
import { ChevronLeft, UserPlus } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { AppText, Button, Card, EmptyState, Pill, Row, ScrollScreen, SectionHeader } from '@/components/ui';
import { palette, spacing } from '@/constants/theme';
import { can, ROLE_LABELS } from '@/domain/permissions';
import { staffDossier } from '@/domain/staff';
import { phone as fmtPhone } from '@/lib/format';
import { useStore } from '@/providers/store';
import type { Role } from '@/types/domain';

const ORDER: Role[] = ['admin', 'sales', 'field', 'tailor'];

export default function TeamScreen() {
  const { db, role } = useStore();
  const router = useRouter();
  const now = Date.now();

  const groups = useMemo(
    () =>
      ORDER.map((r) => ({
        role: r,
        people: db.profiles.filter((p) => p.role === r),
      })).filter((g) => g.people.length > 0),
    [db.profiles],
  );

  if (!can(role, 'manage_users')) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<UserPlus size={26} color={palette.olive} />}
          title="غير متاح"
          body="إدارة حسابات الطاقم للأدمن وحده."
        />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <Button
        label="إضافة موظف"
        full
        icon={<UserPlus size={18} color={palette.ivory} />}
        onPress={() => router.push('/team/new')}
      />

      {groups.map((g) => (
        <View key={g.role} style={{ gap: spacing.sm }}>
          <SectionHeader title={ROLE_LABELS[g.role]} subtitle={`${g.people.length} حساب`} />
          {g.people.map((p) => {
            const dossier = staffDossier(db, p.id, now);
            const late = dossier.open.filter((t) => t.overdue).length;
            return (
              <Card
                key={p.id}
                onPress={() => router.push({ pathname: '/team/[id]', params: { id: p.id } })}
              >
                <Row gap={spacing.md} align="center">
                  <Avatar id={p.id} name={p.fullName} size={46} />
                  <View style={{ flex: 1 }}>
                    <Row gap={spacing.sm}>
                      <AppText variant="heading" numberOfLines={1} style={{ fontSize: 16.5 }}>
                        {p.fullName}
                      </AppText>
                      {!p.isActive && (
                        <Pill label="معطّل" bg={palette.sand} fg={palette.muted} small />
                      )}
                    </Row>
                    <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                      {p.title} • {fmtPhone(p.phone)}
                    </AppText>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <AppText variant="number" color={late > 0 ? palette.danger : palette.charcoal}>
                      {dossier.open.length}
                    </AppText>
                    <AppText variant="caption" color={palette.muted}>
                      بين يديه
                    </AppText>
                  </View>
                  <ChevronLeft size={18} color={palette.muted} />
                </Row>
              </Card>
            );
          })}
        </View>
      ))}
    </ScrollScreen>
  );
}
