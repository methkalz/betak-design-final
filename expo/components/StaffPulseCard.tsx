/**
 * نبض الطاقم على لوحة الأدمن.
 *
 * سؤال المالك حين ينظر إلى طاقمه ليس «كم أنجز فلان هذا الشهر» - ذاك سؤال
 * تقييمٍ شهري مكانه ملف الموظف. سؤاله اليومي: **من يحتاج دفعة الآن؟**
 * فالصفوف مرتّبة بالإلحاح: المتأخر أولًا، ثم الأثقل حملًا، ثم الأطول
 * سكونًا - ويكفيه أن يقرأ أول سطرين.
 *
 * ولذلك تُعرض ثلاث حقائق لا أكثر: كم بين يديه، كم فات موعده، ومتى تحرّك
 * آخر مرة. الرابع يُشتّت.
 */
import { useRouter } from 'expo-router';
import { AlertTriangle, Users } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { AppText, Divider, Pill, Row } from '@/components/ui';
import { palette, spacing } from '@/constants/theme';
import { ROLE_LABELS } from '@/domain/permissions';
import { staffPulse } from '@/domain/staff';
import { useStore } from '@/providers/store';

/** «اليوم» و«أمس» أوقع من «قبل يوم»، وما بَعُد يُقال بالأيام. */
function idleLabel(days: number | null): { text: string; alarming: boolean } {
  if (days === null) return { text: 'لم يبدأ بعد', alarming: false };
  if (days <= 0) return { text: 'نشط اليوم', alarming: false };
  if (days === 1) return { text: 'آخر نشاط أمس', alarming: false };
  return { text: `ساكن منذ ${days} أيام`, alarming: days >= 3 };
}

export function StaffPulseCard() {
  const { db, currentUser } = useStore();
  const router = useRouter();

  const rows = useMemo(
    () => staffPulse(db, Date.now(), currentUser?.id ?? null),
    [db, currentUser?.id],
  );

  if (rows.length === 0) return null;

  const lateTotal = rows.reduce((s, r) => s + r.overdue, 0);

  return (
    <View>
      {rows.map((r, i) => {
        const idle = idleLabel(r.idleDays);
        return (
          <View key={r.profileId}>
            <Pressable
              onPress={() => router.push({ pathname: '/team/[id]', params: { id: r.profileId } })}
              style={({ pressed }) => [
                { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
                pressed && { backgroundColor: 'rgba(79,70,229,0.06)' },
              ]}
            >
              <Row gap={spacing.md}>
                <Avatar id={r.profileId} name={r.fullName} size={42} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Row gap={spacing.sm}>
                    <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {r.fullName}
                    </AppText>
                    <AppText variant="caption" color={palette.muted}>
                      {ROLE_LABELS[r.role]}
                    </AppText>
                  </Row>
                  <AppText
                    variant="caption"
                    color={idle.alarming ? palette.warning : palette.muted}
                  >
                    {r.open === 0 ? 'لا مهام مفتوحة' : `${r.open} مهمة بين يديه`} • {idle.text}
                  </AppText>
                </View>
                {r.overdue > 0 ? (
                  <Pill
                    label={`فات موعد ${r.overdue}`}
                    bg={palette.dangerSoft}
                    fg={palette.danger}
                    small
                    icon={<AlertTriangle size={11} color={palette.danger} />}
                  />
                ) : r.open > 0 ? (
                  <Pill
                    label="في موعده"
                    bg={palette.sageSoft}
                    fg={palette.oliveDark}
                    small
                  />
                ) : null}
              </Row>
            </Pressable>
            {i < rows.length - 1 && (
              <Divider
                style={{
                  marginVertical: 0,
                  marginHorizontal: spacing.lg,
                  backgroundColor: 'rgba(0,0,0,0.05)',
                }}
              />
            )}
          </View>
        );
      })}

      {lateTotal === 0 && (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
          <Row gap={6}>
            <Users size={13} color={palette.muted} />
            <AppText variant="caption" color={palette.muted}>
              لا شيء فات موعده - الطاقم في وقته.
            </AppText>
          </Row>
        </View>
      )}
    </View>
  );
}
