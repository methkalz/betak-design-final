/**
 * إنهاء الشبابيك - قائمة الغرف وشبابيكها.
 *
 * الخياط يعمل شباكًا شباكًا لا مشروعًا كاملًا، فالتأكيد بهذا المقاس. وتأكيد
 * الإنجاز هو نفسه تسجيل الاستهلاك: لو فُصلا لصار ممكنًا أن يُعلَّم شباك
 * منجزًا بلا أمتار، أو أن تُسجَّل أمتار بلا أن يُعرف لأي شباك ذهبت.
 *
 * والعرض سطرٌ واحد لكل شباك: الاسم، ثم قياسه ونوعه بخط هادئ، ثم رقم واحد
 * على اليسار. المنجز يهدأ لونه وتظهر عليه علامة، فالعين تمسح العمود الأيسر
 * وحده لتعرف أين وصل العمل - بدل أن تقرأ كل بطاقة.
 */
import { Check, Scissors, TriangleAlert } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  AppText,
  Banner,
  Button,
  Card,
  Divider,
  Field,
  Pill,
  Row,
  SectionHeader,
  Swatch,
} from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { CURTAIN_MODEL_LABELS, TRACK_LABELS } from '@/domain/labels';
import { finishedWindowIds, windowFabricNeed } from '@/domain/fabricPlan';
import { round3 } from '@/domain/pricing';
import { cm, meters } from '@/lib/format';
import { useStore } from '@/providers/store';

export function WindowCompletion({ projectId }: { projectId: string }) {
  const { db, busy, completeWindow } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const rooms = db.rooms
    .filter((r) => r.projectId === projectId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const done = useMemo(() => finishedWindowIds(db, projectId), [db, projectId]);
  const all = db.windows.filter((w) => w.projectId === projectId);

  const openWindow = db.windows.find((w) => w.id === openId) ?? null;
  const planned = openWindow ? windowFabricNeed(db, openWindow.id) : 0;
  const qty = parseFloat(quantity || '0');
  const over = qty > planned + 0.0001;

  const start = (windowId: string) => {
    setError(null);
    setInfo(null);
    setReason('');
    // الكمية المخططة جاهزة في الحقل: هي الحالة الغالبة، والتعديل عليها
    // استثناء يُكتب لا قاعدة تُملأ في كل مرة
    setQuantity(String(windowFabricNeed(db, windowId)));
    setOpenId(windowId);
  };

  const submit = async () => {
    if (!openWindow) return;
    setError(null);
    const res = await completeWindow(openWindow.id, qty, reason);
    if (!res.ok) return setError(res.error);
    setInfo(`تم إنهاء ${openWindow.name} بتسجيل ${meters(round3(qty))}.`);
    setOpenId(null);
  };

  if (all.length === 0) return null;

  return (
    <Card>
      <SectionHeader
        title="إنهاء الشبابيك"
        subtitle={`${done.size} من ${all.length} - التأكيد يسجّل الاستهلاك`}
      />

      {rooms.map((room, ri) => {
        const windows = all.filter((w) => w.roomId === room.id);
        if (windows.length === 0) return null;
        const roomDone = windows.filter((w) => done.has(w.id)).length;
        return (
          <View key={room.id}>
            {ri > 0 && <Divider />}
            <Row justify="space-between" style={{ paddingBottom: 2 }}>
              <AppText variant="label">{room.name}</AppText>
              <AppText
                variant="caption"
                color={roomDone === windows.length ? palette.success : palette.muted}
              >
                {roomDone}/{windows.length}
              </AppText>
            </Row>

            {windows.map((w) => {
              const isDone = done.has(w.id);
              const used = db.usages
                .filter((u) => u.windowId === w.id)
                .reduce((s, u) => s + u.actualM, 0);
              const variant = db.fabricVariants.find((v) => v.id === w.fabricVariantId);
              return (
                <Pressable
                  key={w.id}
                  disabled={isDone}
                  onPress={() => start(w.id)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: palette.ivoryDeep },
                  ]}
                >
                  <Row gap={spacing.md} align="center">
                    <View style={[styles.mark, isDone && { backgroundColor: palette.successSoft }]}>
                      {isDone ? (
                        <Check size={14} color={palette.success} />
                      ) : (
                        <Swatch color={variant?.colorHex ?? palette.sand} size={26} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="label" color={isDone ? palette.muted : palette.charcoal}>
                        {w.name}
                      </AppText>
                      <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                        {cm(w.widthCm)} × {cm(w.heightCm)} • {CURTAIN_MODEL_LABELS[w.model]}
                      </AppText>
                    </View>
                    <View style={{ alignItems: 'flex-start' }}>
                      <AppText variant="label" color={isDone ? palette.success : palette.charcoal}>
                        {meters(isDone ? round3(used) : windowFabricNeed(db, w.id))}
                      </AppText>
                      <AppText variant="caption" color={palette.muted}>
                        {isDone ? 'استُهلك' : 'مخطط'}
                      </AppText>
                    </View>
                  </Row>
                </Pressable>
              );
            })}
          </View>
        );
      })}

      {!!info && (
        <View style={{ marginTop: spacing.md }}>
          <Banner tone="success" title={info} />
        </View>
      )}

      {!!openWindow && (
        <View style={styles.sheet}>
          <Row justify="space-between" align="flex-start">
            <View style={{ flex: 1 }}>
              <AppText variant="heading">{openWindow.name}</AppText>
              <AppText variant="caption" color={palette.muted}>
                المخطط {meters(planned)} - أكّد ما استُهلك فعلًا
              </AppText>
            </View>
            <Pill
              label={CURTAIN_MODEL_LABELS[openWindow.model]}
              bg={palette.sand}
              fg={palette.oliveDark}
              small
            />
          </Row>

          {/* تفاصيل الخياطة هنا لا في بطاقة ثانية تسرد الشبابيك مرة أخرى:
              هذه اللحظة هي التي يحتاجها الخياط فيها، وهي لشباك بعينه. */}
          <View style={{ marginTop: spacing.sm, gap: 2 }}>
            <AppText variant="caption" color={palette.muted}>
              {cm(openWindow.widthCm)} × {cm(openWindow.heightCm)} • {TRACK_LABELS[openWindow.track]}{' '}
              • مضاعف ×{openWindow.fullness} •{' '}
              {openWindow.hasLining ? 'مع بطانة' : 'بدون بطانة'}
            </AppText>
            {!!openWindow.notes && (
              <AppText variant="caption" color={palette.charcoal}>
                {openWindow.notes}
              </AppText>
            )}
          </View>

          <View style={{ marginTop: spacing.md, gap: spacing.md }}>
            <Field
              label="الأمتار المستهلكة"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
              suffix="متر"
            />
            {over && (
              <>
                <Banner
                  tone="warning"
                  title={`زيادة ${meters(round3(qty - planned))} عن المخطط`}
                  body="مقبولة، لكنها تُسجَّل بسببها ويصل إشعار لإدارة بيتك ديزاين."
                  icon={<TriangleAlert size={16} color={palette.warning} />}
                />
                <Field
                  label="سبب الزيادة"
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  placeholder="مثال: تكرار النقشة أضاف نصف متر لكل قطعة."
                />
              </>
            )}
            {!!error && <Banner tone="danger" title="تعذر التسجيل" body={error} />}
            <Row gap={spacing.sm}>
              <Button
                label="تأكيد الإنهاء"
                style={{ flex: 1 }}
                loading={busy === 'consume'}
                disabled={!(qty > 0)}
                icon={<Scissors size={17} color={palette.ivory} />}
                onPress={submit}
              />
              <Button label="إلغاء" variant="ghost" onPress={() => setOpenId(null)} />
            </Row>
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: radius.sm, paddingVertical: spacing.sm, minHeight: 52, justifyContent: 'center' },
  mark: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** لوح التأكيد داخل البطاقة - لا نافذة تُغطّي القائمة التي يقرأ منها. */
  sheet: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.4,
    borderColor: palette.sandDeep,
    backgroundColor: palette.ivory,
    padding: spacing.md,
  },
});
