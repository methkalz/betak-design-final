import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Scissors,
} from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AdvanceButton } from '@/components/AdvanceButton';
import { WindowCompletion } from '@/components/WindowCompletion';
import {
  AppText,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  Divider,
  EmptyState,
  Pill,
  Row,
  ScrollScreen,
  SectionHeader,
} from '@/components/ui';
import { font, palette, spacing } from '@/constants/theme';
import {
  CURTAIN_MODEL_LABELS,
  TAILOR_STAGE_LABELS,
  TAILOR_STAGE_ORDER,
  TRACK_LABELS,
} from '@/domain/labels';
import { finishedWindowIds } from '@/domain/fabricPlan';
import { formatDate } from '@/lib/format';
import { useStore } from '@/providers/store';
import type { TailorStage } from '@/types/domain';

export default function TailorAssignmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { db, advanceStage } = useStore();

  const [pending, setPending] = useState<{ to: TailorStage; back: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assignment = db.tailorAssignments.find((a) => a.id === id);
  if (!assignment) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<Scissors size={26} color={palette.olive} />}
          title="أمر الإنتاج غير موجود"
          body="راجع قائمة أوامر الإنتاج."
        />
      </ScrollScreen>
    );
  }

  const project = db.projects.find((p) => p.id === assignment.projectId);
  const customer = db.customers.find((c) => c.id === project?.customerId);
  const windows = db.windows.filter((w) => w.projectId === assignment.projectId);
  const finished = finishedWindowIds(db, assignment.projectId);
  const allDone = windows.length > 0 && windows.every((w) => finished.has(w.id));

  const stageIndex = TAILOR_STAGE_ORDER.indexOf(assignment.stage);
  const nextStage = TAILOR_STAGE_ORDER[stageIndex + 1];
  const prevStage = TAILOR_STAGE_ORDER[stageIndex - 1];

  return (
    <ScrollScreen>
      <Card>
        <Row justify="space-between" align="flex-start">
          <View style={{ flex: 1 }}>
            <AppText variant="title">{project?.title}</AppText>
            <AppText variant="caption" color={palette.muted}>
              {customer?.fullName} • {project?.code}
            </AppText>
          </View>
          <Pill
            label={TAILOR_STAGE_LABELS[assignment.stage]}
            bg={palette.terracottaSoft}
            fg={palette.terracotta}
          />
        </Row>
        <Divider />
        <AppText variant="label">تعليمات الخياطة</AppText>
        <AppText variant="body" color={palette.muted}>
          {assignment.instructions}
        </AppText>
        <AppText variant="caption" color={palette.muted} style={{ marginTop: spacing.sm }}>
          موعد التسليم: {formatDate(assignment.dueDate)}
        </AppText>
      </Card>

      <Card>
        {/* الخط الزمني للقراءة، والتقدّم بزرٍّ واحد صريح.
            كان كل سطر قابلًا للضغط فيقفز الأمر إلى أي مرحلة بلا تأكيد - وهو
            ما يترك مراحل بلا توقيت في السجل، فيصير «متوسط مدة الأمر»
            و«التزام بالموعد» محسوبَين على تاريخ ناقص. */}
        <SectionHeader title="مراحل الإنتاج" subtitle="المرحلة الحالية وما قبلها وما بعدها" />
        {TAILOR_STAGE_ORDER.map((stage, i) => {
          const done = i < stageIndex;
          const active = i === stageIndex;
          const at = assignment.stageHistory.find((h) => h.stage === stage);
          return (
            <View key={stage} style={{ opacity: done || active ? 1 : 0.45 }}>
              <Row gap={spacing.md} style={{ paddingVertical: spacing.sm }}>
                {done || active ? (
                  <CheckCircle2 size={22} color={active ? palette.terracotta : palette.success} />
                ) : (
                  <CircleDashed size={22} color={palette.sandDeep} />
                )}
                <View style={{ flex: 1 }}>
                  <AppText
                    variant={active ? 'label' : 'caption'}
                    color={active ? palette.charcoal : palette.muted}
                    style={active ? { fontFamily: font.bold } : undefined}
                  >
                    {TAILOR_STAGE_LABELS[stage]}
                  </AppText>
                  {!!at && (
                    <AppText variant="caption" color={palette.muted}>
                      {formatDate(at.at)}
                    </AppText>
                  )}
                </View>
              </Row>
            </View>
          );
        })}

        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          {!!nextStage && (
            <>
              <AdvanceButton
                label={TAILOR_STAGE_LABELS[nextStage]}
                disabled={nextStage === 'ready' && !allDone}
                onPress={() => setPending({ to: nextStage, back: false })}
              />
              {nextStage === 'ready' && !allDone && (
                <AppText variant="caption" color={palette.muted} align="center">
                  أكّد إنهاء كل الشبابيك أولًا - {finished.size} من {windows.length}
                </AppText>
              )}
            </>
          )}
          {!!prevStage && (
            <Pressable onPress={() => setPending({ to: prevStage, back: true })} style={styles.backStep}>
              <AppText variant="caption" color={palette.muted} align="center">
                رجوع إلى: {TAILOR_STAGE_LABELS[prevStage]}
              </AppText>
            </Pressable>
          )}
          {!nextStage && (
            <Banner
              tone="success"
              title="اكتمل أمر الإنتاج"
              body="انتقل المشروع إلى «جاهز للتركيب» ووصل الإشعار للعامل الميداني."
            />
          )}
        </View>
      </Card>

      <ConfirmSheet
        visible={!!pending}
        icon={
          pending?.back ? (
            <ChevronRight size={24} color={palette.muted} />
          ) : (
            <ChevronLeft size={24} color={palette.olive} />
          )
        }
        title={pending?.back ? 'رجوع بالأمر خطوة' : 'نقل الأمر للمرحلة التالية'}
        body={
          pending?.to === 'ready'
            ? 'سيُغلق أمر الإنتاج، وينتقل المشروع إلى «جاهز للتركيب»، ويصل الإشعار للعامل الميداني.'
            : pending
              ? `سيصبح الأمر في مرحلة "${TAILOR_STAGE_LABELS[pending.to]}"، ويظهر بها لكل الفريق.`
              : undefined
        }
        confirmLabel={pending?.back ? 'تأكيد الرجوع' : 'نعم، انقل الأمر'}
        onConfirm={() => {
          if (pending) {
            const res = advanceStage(assignment.id, pending.to);
            if (!res.ok) setError(res.error);
          }
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />

      <WindowCompletion projectId={assignment.projectId} />

      <Button
        label="فتح المشروع"
        variant="ghost"
        full
        onPress={() => router.push(`/project/${assignment.projectId}`)}
      />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  /** الرجوع خطوةً تصحيحٌ لا إجراء، فحضوره أهدأ من زر التقدّم. */
  backStep: { minHeight: 44, justifyContent: 'center' },
});
