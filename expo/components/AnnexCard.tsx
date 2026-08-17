/**
 * الملحق على شاشة المشروع.
 *
 * الزبون يضيف شباكًا أثناء العمل - وهذا واقع المعرض لا استثناء. والعرض
 * المعتمد لا يُمسّ، فالإضافة تصير **مستندًا مستقلًا** معلَّقًا على أصله:
 * له شبابيكه وعرضه وأمر إنتاجه، وليس له دفترُ دفعات - الرصيد واحد على
 * الأصل، وذاك قيدٌ في القاعدة لا عُرفٌ في الشاشة.
 *
 * على الأصل: الأرقام الثلاثة وزرُّ فتح ملحق حين يستحق.
 * على الملحق: إشارةٌ إلى أصله وطريقُ العودة إليه.
 */
import { useRouter } from 'expo-router';
import { CornerDownLeft, FilePlus2, Link2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { AppText, Banner, Button, Card, Divider, Field, Pill, Row, SectionHeader } from '@/components/ui';
import { palette, spacing } from '@/constants/theme';
import { PROJECT_STATUS_LABELS } from '@/domain/labels';
import { projectAnnexes, projectFamilyFinance } from '@/hooks/selectors';
import { money } from '@/lib/format';
import { useStore } from '@/providers/store';
import type { UUID } from '@/types/domain';

export function AnnexCard({ projectId }: { projectId: UUID }) {
  const { db, busy, createProjectAnnex } = useStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const project = db.projects.find((p) => p.id === projectId);
  if (!project) return null;

  // ── على الملحق: من أين جاء ──
  if (project.parentProjectId) {
    const parent = db.projects.find((p) => p.id === project.parentProjectId);
    return (
      <Card>
        <Row gap={spacing.sm}>
          <Link2 size={16} color={palette.olive} />
          <AppText variant="heading">ملحق {project.annexSeq}</AppText>
        </Row>
        <AppText variant="caption" color={palette.muted} style={{ marginTop: 4 }}>
          {project.annexReason
            ? project.annexReason
            : 'إضافة على مشروعٍ قائم - تُسعَّر بأسعار اليوم وتُوقَّع وحدها.'}
        </AppText>
        <AppText variant="caption" color={palette.muted} style={{ marginTop: 6 }}>
          الدفعات والرصيد على المشروع الأصل - لا يُسجَّل هنا مال.
        </AppText>
        {!!parent && (
          <Button
            label={`المشروع الأصل ${parent.code}`}
            variant="ghost"
            full
            icon={<CornerDownLeft size={16} color={palette.olive} />}
            style={{ marginTop: spacing.md }}
            onPress={() => router.replace({ pathname: '/project/[id]', params: { id: parent.id } })}
          />
        )}
      </Card>
    );
  }

  // ── على الأصل: الأرقام الثلاثة، الملاحق، وزرُّ الفتح ──
  const fin = projectFamilyFinance(db, projectId);
  const annexes = projectAnnexes(db, projectId);
  const approved = db.quotationVersions.some(
    (v) =>
      v.status === 'approved' &&
      db.quotations.some((q) => q.id === v.quotationId && q.projectId === projectId),
  );
  const hasOpenAnnex = annexes.some((a) => a.status !== 'completed');
  const canAdd = approved && project.status !== 'completed' && !hasOpenAnnex;

  if (!approved && annexes.length === 0) return null;

  return (
    <Card>
      <SectionHeader
        title="الملاحق"
        subtitle={annexes.length === 0 ? 'إضافات الزبون بعد الاتفاق' : `${annexes.length} ملحق`}
      />

      {fin.annexCount > 0 && (
        <View style={{ gap: 6, marginBottom: spacing.md }}>
          <Row justify="space-between">
            <AppText variant="caption" color={palette.muted}>المشروع الأصل</AppText>
            <AppText variant="label">{money(fin.originalAgorot)}</AppText>
          </Row>
          <Row justify="space-between">
            <AppText variant="caption" color={palette.muted}>الملاحق المعتمدة</AppText>
            <AppText variant="label">{money(fin.annexAgorot)}</AppText>
          </Row>
          <Divider style={{ marginVertical: 4 }} />
          <Row justify="space-between">
            <AppText variant="label">الإجمالي</AppText>
            <AppText variant="number">{money(fin.totalAgorot)}</AppText>
          </Row>
          <Row justify="space-between">
            <AppText variant="caption" color={palette.muted}>المتبقي على الزبون</AppText>
            <AppText variant="label" color={fin.dueAgorot > 0 ? palette.warning : palette.success}>
              {money(fin.dueAgorot)}
            </AppText>
          </Row>
        </View>
      )}

      {annexes.map((a) => (
        <Row key={a.id} justify="space-between" style={{ paddingVertical: 6 }}>
          <View style={{ flex: 1 }}>
            <AppText variant="label">{a.code}</AppText>
            <AppText variant="caption" color={palette.muted} numberOfLines={1}>
              {a.annexReason || 'إضافة'}
            </AppText>
          </View>
          <Row gap={spacing.sm}>
            <Pill label={PROJECT_STATUS_LABELS[a.status]} bg={palette.sand} fg={palette.oliveDark} small />
            <Button
              label="افتح"
              variant="ghost"
              small
              onPress={() => router.push({ pathname: '/project/[id]', params: { id: a.id } })}
            />
          </Row>
        </Row>
      ))}

      {!!error && <Banner tone="danger" title="تعذر فتح الملحق" body={error} />}

      {canAdd && !open && (
        <Button
          label="فتح ملحق للإضافة"
          variant="secondary"
          full
          icon={<FilePlus2 size={16} color={palette.oliveDark} />}
          style={{ marginTop: spacing.md }}
          onPress={() => {
            setError(null);
            setOpen(true);
          }}
        />
      )}

      {canAdd && open && (
        <View style={{ gap: spacing.md, marginTop: spacing.md }}>
          <AppText variant="caption" color={palette.muted}>
            الملحق يُقاس ويُسعَّر ويُوقَّع وحده بأسعار اليوم. الدفعات تبقى على هذا المشروع.
          </AppText>
          <Field
            label="سبب الإضافة"
            value={reason}
            onChangeText={setReason}
            placeholder="الزبون أضاف شباكي المطبخ"
          />
          <Row gap={spacing.sm}>
            <Button
              label="إلغاء"
              variant="ghost"
              onPress={() => setOpen(false)}
              style={{ flex: 1 }}
            />
            <Button
              label="أنشئ الملحق"
              loading={busy === 'annex'}
              onPress={async () => {
                setError(null);
                const res = await createProjectAnnex(projectId, reason);
                if (!res.ok) return setError(res.error);
                setOpen(false);
                setReason('');
                router.push({ pathname: '/project/[id]', params: { id: res.data } });
              }}
              style={{ flex: 1 }}
            />
          </Row>
        </View>
      )}

      {hasOpenAnnex && (
        <AppText variant="caption" color={palette.muted} style={{ marginTop: spacing.sm }}>
          ملحقٌ مفتوح الآن - أنهِه قبل فتح غيره.
        </AppText>
      )}
    </Card>
  );
}
