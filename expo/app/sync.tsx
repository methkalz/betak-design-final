import { CheckCircle2, CloudOff, RefreshCcw, UploadCloud } from 'lucide-react-native';
import React from 'react';
import { Switch, View } from 'react-native';

import { AppText, Banner, Button, Card, Divider, Pill, Row, ScrollScreen, SectionHeader } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { SYNC_LABELS } from '@/domain/labels';
import { relativeTime } from '@/lib/format';
import { useStore } from '@/providers/store';
import type { SyncState } from '@/types/domain';

const STATE_COLORS: Record<SyncState, { bg: string; fg: string }> = {
  saved_local: { bg: palette.sand, fg: palette.oliveDark },
  pending: { bg: palette.warningSoft, fg: palette.warning },
  syncing: { bg: palette.infoSoft, fg: palette.info },
  synced: { bg: palette.successSoft, fg: palette.success },
  failed: { bg: palette.dangerSoft, fg: palette.danger },
  needs_review: { bg: palette.terracottaSoft, fg: palette.terracotta },
};

export default function SyncScreen() {
  const { db, isOnline, setIsOnline, retryFailedOperations } = useStore();
  const queue = db.operations;
  const pending = queue.filter((o) => o.state !== 'synced');
  const photos = db.attachments.filter((a) => !a.uploaded);

  return (
    <ScrollScreen>
      <Card>
        <Row justify="space-between">
          <Row gap={spacing.md} style={{ flex: 1 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.md,
                backgroundColor: isOnline ? palette.successSoft : palette.dangerSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CloudOff size={20} color={isOnline ? palette.success : palette.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="heading">{isOnline ? 'متصل' : 'دون اتصال'}</AppText>
              <AppText variant="caption" color={palette.muted}>
                Supabase هو مصدر الحقيقة، والجهاز نسخة تشغيل مؤقتة.
              </AppText>
            </View>
          </Row>
          <Switch
            value={!isOnline}
            onValueChange={(v) => setIsOnline(!v)}
            trackColor={{ true: palette.terracotta, false: palette.sandDeep }}
            thumbColor={palette.white}
          />
        </Row>
      </Card>

      <Banner
        tone="info"
        title="ما الذي يعمل دون اتصال؟"
        body="القياسات، الصور، ملاحظات التركيب وتحديثات المشروع تُحفظ محليًا وتُزامن لاحقًا. أما المخزون والدفعات والخصومات فتبقى خادمية ولا تُعتبر مؤكدة قبل نجاح RPC."
      />

      <Row gap={spacing.md}>
        <View style={{ flex: 1, backgroundColor: palette.ivoryDeep, borderRadius: radius.lg, padding: spacing.md }}>
          <AppText variant="number">{pending.length}</AppText>
          <AppText variant="caption" color={palette.muted}>
            عملية بانتظار المزامنة
          </AppText>
        </View>
        <View style={{ flex: 1, backgroundColor: palette.ivoryDeep, borderRadius: radius.lg, padding: spacing.md }}>
          <AppText variant="number">{photos.length}</AppText>
          <AppText variant="caption" color={palette.muted}>
            صورة في طابور الرفع
          </AppText>
        </View>
      </Row>

      {queue.some((o) => o.state === 'failed') && (
        <Button
          label="إعادة محاولة العمليات الفاشلة"
          full
          variant="secondary"
          icon={<RefreshCcw size={16} color={palette.oliveDark} />}
          onPress={retryFailedOperations}
        />
      )}

      <Card>
        <SectionHeader title="طابور العمليات" subtitle="كل عملية تحمل client_operation_id ومفتاح idempotency" />
        {queue.length === 0 && (
          <Row gap={spacing.sm}>
            <CheckCircle2 size={16} color={palette.success} />
            <AppText variant="caption" color={palette.muted}>
              كل شيء متزامن — لا توجد عمليات معلّقة.
            </AppText>
          </Row>
        )}
        {queue.slice(0, 40).map((op, i) => {
          const c = STATE_COLORS[op.state];
          return (
            <View key={op.id}>
              <Row justify="space-between" align="flex-start">
                <Row gap={spacing.md} style={{ flex: 1 }}>
                  <UploadCloud size={16} color={c.fg} style={{ marginTop: 4 }} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="label">{op.label}</AppText>
                    <AppText variant="caption" color={palette.muted}>
                      {relativeTime(op.createdAt)} • محاولات {op.attempts}
                    </AppText>
                  </View>
                </Row>
                <Pill label={SYNC_LABELS[op.state]} bg={c.bg} fg={c.fg} small />
              </Row>
              {i < Math.min(queue.length, 40) - 1 && <Divider />}
            </View>
          );
        })}
      </Card>
    </ScrollScreen>
  );
}
