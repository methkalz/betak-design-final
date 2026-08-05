import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Scissors,
  TriangleAlert,
} from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AdvanceButton } from '@/components/AdvanceButton';
import {
  AppText,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  Divider,
  EmptyState,
  Field,
  Pill,
  Row,
  ScrollScreen,
  SectionHeader,
  Swatch,
} from '@/components/ui';
import { font, palette, radius, spacing } from '@/constants/theme';
import {
  CURTAIN_MODEL_LABELS,
  TAILOR_STAGE_LABELS,
  TAILOR_STAGE_ORDER,
  TRACK_LABELS,
} from '@/domain/labels';
import { round3 } from '@/domain/pricing';
import { cm, formatDate, meters } from '@/lib/format';
import { useStore } from '@/providers/store';
import type { TailorStage } from '@/types/domain';

export default function TailorAssignmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { db, busy, advanceStage, consumeFabric } = useStore();

  const [pending, setPending] = useState<{ to: TailorStage; back: boolean } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

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
  const reservations = db.reservations.filter(
    (r) => r.projectId === assignment.projectId && r.status !== 'released',
  );
  const reservation = reservations.find((r) => r.id === selected) ?? null;
  const outstanding = reservation ? round3(reservation.quantityM - reservation.consumedM) : 0;
  const qty = parseFloat(quantity || '0');
  const isOver = reservation ? qty > outstanding + 0.0001 : false;

  const stageIndex = TAILOR_STAGE_ORDER.indexOf(assignment.stage);
  const nextStage = TAILOR_STAGE_ORDER[stageIndex + 1];
  const prevStage = TAILOR_STAGE_ORDER[stageIndex - 1];

  const submitUsage = async () => {
    setError(null);
    setInfo(null);
    if (!reservation) return setError('اختر الرول المحجوز أولًا.');
    const res = await consumeFabric(reservation.id, qty, reason);
    if (!res.ok) return setError(res.error);
    setQuantity('');
    setReason('');
    setInfo('تم تسجيل الاستهلاك وخصمه من الرول.');
  };

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
            <AdvanceButton
              label={TAILOR_STAGE_LABELS[nextStage]}
              onPress={() => setPending({ to: nextStage, back: false })}
            />
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

      <Card>
        <SectionHeader title="المقاسات" subtitle={`${windows.length} قطعة`} />
        {windows.map((w) => {
          const room = db.rooms.find((r) => r.id === w.roomId);
          const variant = db.fabricVariants.find((v) => v.id === w.fabricVariantId);
          const fabric = round3((w.widthCm / 100) * w.quantity * w.fullness);
          return (
            <View key={w.id} style={{ paddingVertical: spacing.sm }}>
              <Row gap={spacing.md}>
                <Swatch color={variant?.colorHex ?? palette.sand} size={34} />
                <View style={{ flex: 1 }}>
                  <AppText variant="label">
                    {room?.name} - {w.name}
                  </AppText>
                  <AppText variant="caption" color={palette.muted}>
                    {cm(w.widthCm)} × {cm(w.heightCm)} • {CURTAIN_MODEL_LABELS[w.model]} •{' '}
                    {TRACK_LABELS[w.track]}
                  </AppText>
                  <AppText variant="caption" color={palette.olive}>
                    قماش مطلوب {meters(fabric)} • مضاعف ×{w.fullness} •{' '}
                    {w.hasLining ? 'مع بطانة' : 'بدون بطانة'}
                  </AppText>
                  {!!w.notes && (
                    <AppText variant="caption" color={palette.muted}>
                      {w.notes}
                    </AppText>
                  )}
                </View>
              </Row>
            </View>
          );
        })}
      </Card>

      <Card>
        <SectionHeader title="تسجيل الاستهلاك" subtitle="يُخصم مباشرة من الرول المحجوز" />
        <View style={{ gap: spacing.sm }}>
          {reservations.map((r) => {
            const roll = db.fabricRolls.find((x) => x.id === r.rollId);
            const variant = db.fabricVariants.find((v) => v.id === roll?.variantId);
            const active = selected === r.id;
            return (
              <Pressable
                key={r.id}
                onPress={() => setSelected(r.id)}
                style={[
                  {
                    borderRadius: radius.md,
                    borderWidth: 1.4,
                    borderColor: palette.line,
                    padding: spacing.md,
                    minHeight: 60,
                    justifyContent: 'center',
                  },
                  active && { borderColor: palette.olive, backgroundColor: palette.sageSoft },
                ]}
              >
                <Row justify="space-between">
                  <Row gap={spacing.md}>
                    <Swatch color={variant?.colorHex ?? palette.sand} size={30} />
                    <View>
                      <AppText variant="label">{roll?.code}</AppText>
                      <AppText variant="caption" color={palette.muted}>
                        متبقٍ من الحجز {meters(round3(r.quantityM - r.consumedM))}
                      </AppText>
                    </View>
                  </Row>
                  {active && <CheckCircle2 size={18} color={palette.olive} />}
                </Row>
              </Pressable>
            );
          })}
          {reservations.length === 0 && (
            <AppText variant="caption" color={palette.muted}>
              لا يوجد قماش محجوز لهذا المشروع بعد.
            </AppText>
          )}
        </View>

        {!!reservation && (
          <View style={{ marginTop: spacing.md, gap: spacing.md }}>
            <Field
              label="الكمية المستهلكة"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
              suffix="متر"
              placeholder={String(outstanding)}
            />
            {isOver && (
              <Banner
                tone="warning"
                title="الاستهلاك أعلى من المخطط"
                body="السبب إلزامي وسيتم إشعار الأدمن فورًا."
                icon={<TriangleAlert size={16} color={palette.warning} />}
              />
            )}
            {(isOver || qty > 0) && (
              <Field
                label={isOver ? 'سبب الزيادة (إلزامي)' : 'ملاحظة'}
                value={reason}
                onChangeText={setReason}
                multiline
                placeholder="خطأ في القص، عيب في القماش، تكرار نقشة..."
              />
            )}
            <Button
              label="تسجيل الاستهلاك"
              full
              loading={busy === 'consume'}
              disabled={!(qty > 0)}
              onPress={submitUsage}
            />
          </View>
        )}

        {!!error && <Banner tone="danger" title="تعذر التسجيل" body={error} />}
        {!!info && <Banner tone="success" title={info} />}
      </Card>

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
