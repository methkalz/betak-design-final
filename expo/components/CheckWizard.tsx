/**
 * معالج الشيكات الجماعي (M6).
 *
 * ثلاثة مدخلات تولّد الرزمة كلها: العدد، مبلغ كل شيك، وتاريخ أول استحقاق -
 * والبقية شهريًا بقاعدة القصّ (31.1 ← 28.2 ← 31.3، لا فيضان للشهر التالي).
 * كل سطر يبقى قابلًا للتعديل يدويًا: الجدولة اقتراح ذكي لا قيد.
 *
 * صور الشيكات اختيارية وتتبع **كل شيك على حدة** لا الرزمة: الزبون يسلّم ستة
 * شيكات، فصورةُ الثالث توثّق الثالث. تُلتقط بالكاميرا أو تُختار من المعرض،
 * وواحدةٌ أو أكثر لكل شيك، وتُضغط قبل الرفع (webp حيث يتاح، وإلا jpeg -
 * iOS لا يشفّر webp) فتصغر للأرشفة وتبقى أرقامها مقروءة.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Camera, CheckCheck, Images, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { DateTimeSheet } from '@/components/DateTimeSheet';
import { AppText, Banner, Button, Divider, Field, Row, SectionHeader } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { checkSchedule } from '@/domain/staffLedger';
import { formatDate, money } from '@/lib/format';
import { useStore } from '@/providers/store';

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

export function CheckWizard({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const { busy, recordCheckSeries } = useStore();
  const [count, setCount] = useState('3');
  const [amount, setAmount] = useState('');
  const [firstDue, setFirstDue] = useState(inDays(30));
  const [overrides, setOverrides] = useState<Record<number, { dueAt?: string; amount?: string }>>({});
  const [editingDate, setEditingDate] = useState<number | null>(null);
  const [photos, setPhotos] = useState<Record<number, string[]>>({});
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const n = Math.max(1, Math.min(36, parseInt(count || '0', 10) || 0));
  const baseAmount = Math.round(parseFloat(amount || '0'));

  /** الجدول المولَّد + تعديلات المستخدم فوقه. */
  const rows = useMemo(() => {
    const dates = checkSchedule(firstDue, n);
    return dates.map((dueAt, i) => ({
      dueAt: overrides[i]?.dueAt ?? dueAt,
      amountShekel: overrides[i]?.amount !== undefined ? parseInt(overrides[i].amount || '0', 10) : baseAmount,
    }));
  }, [firstDue, n, baseAmount, overrides]);

  const total = rows.reduce((s, r) => s + (r.amountShekel || 0), 0);

  /** عرض أقصى 1400 يكفي لقراءة أرقام الشيك، والحجم يهبط أضعافًا. */
  const compress = async (uri: string): Promise<string | null> => {
    for (const format of [ImageManipulator.SaveFormat.WEBP, ImageManipulator.SaveFormat.JPEG]) {
      try {
        const out = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 1400 } }],
          { compress: 0.55, format },
        );
        return out.uri;
      } catch {
        // iOS لا يشفّر webp - يُعاد بـjpeg
      }
    }
    return null;
  };

  const addPhoto = async (row: number, from: 'camera' | 'library') => {
    setError(null);
    setMenuFor(null);
    if (from === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return setError('لا إذن للكاميرا - افتح إعدادات التطبيق وامنحه الإذن.');
    }
    const res =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 1, allowsMultipleSelection: true });
    if (res.canceled || res.assets.length === 0) return;
    const out: string[] = [];
    for (const asset of res.assets) {
      const small = await compress(asset.uri);
      if (small) out.push(small);
    }
    if (out.length === 0) return setError('تعذر تجهيز الصورة - أعد المحاولة.');
    setPhotos((prev) => ({ ...prev, [row]: [...(prev[row] ?? []), ...out] }));
  };

  const dropPhoto = (row: number, uri: string) =>
    setPhotos((prev) => ({ ...prev, [row]: (prev[row] ?? []).filter((u) => u !== uri) }));

  const submit = async () => {
    setError(null);
    if (rows.some((r) => !(r.amountShekel > 0)))
      return setError('كل شيك يجب أن يكون مبلغه أكبر من صفر - بالشيكل الصحيح.');
    const res = await recordCheckSeries({
      projectId,
      checks: rows.map((r, i) => ({
        amountAgorot: r.amountShekel * 100,
        dueAt: r.dueAt,
        photoUris: photos[i] ?? [],
      })),
      note,
    });
    if (!res.ok) return setError(res.error);
    // المال سُجّل. تعذُّر رفع صورةٍ لا يُلغيه - يُقال صراحةً ويبقى الطريق مفتوحًا
    if (res.data > 0) {
      return setWarn(
        `سُجّلت الشيكات، وتعذّر رفع ${res.data} صورة. أضفها لاحقًا من كشف الدفعات.`,
      );
    }
    onDone();
  };

  return (
    <View style={styles.sheet}>
      <SectionHeader
        title="رزمة شيكات"
        subtitle="ثلاثة مدخلات تولّد الجدول، وكل سطر يقبل التعديل"
      />
      <Row gap={spacing.md}>
        <View style={{ flex: 1 }}>
          <Field label="عدد الشيكات" value={count} onChangeText={setCount} keyboardType="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="مبلغ كل شيك"
            value={amount}
            onChangeText={(t) => {
              setAmount(t.replace(/\D/g, ''));
              setOverrides({});
            }}
            keyboardType="numeric"
            suffix="₪"
          />
        </View>
      </Row>
      <View style={{ marginTop: spacing.md }}>
        <AppText variant="caption" color={palette.muted}>
          صرف أول شيك
        </AppText>
        <Pressable onPress={() => setEditingDate(-1)} style={styles.dateBtn}>
          <AppText variant="label">{formatDate(firstDue)}</AppText>
        </Pressable>
      </View>

      {baseAmount > 0 && (
        <>
          <Divider />
          {rows.map((r, i) => (
            <View key={i}>
              <Row justify="space-between" gap={spacing.sm} style={{ paddingVertical: 6 }}>
                <AppText variant="caption" color={palette.muted}>
                  شيك {i + 1}/{n}
                </AppText>
                <Pressable onPress={() => setEditingDate(i)} style={styles.rowDate}>
                  <AppText variant="caption" color={palette.oliveDark}>
                    {formatDate(r.dueAt)}
                  </AppText>
                </Pressable>
                <View style={{ width: 96 }}>
                  <Field
                    label=""
                    value={String(r.amountShekel || '')}
                    onChangeText={(t) =>
                      setOverrides((prev) => ({
                        ...prev,
                        [i]: { ...prev[i], amount: t.replace(/\D/g, '') },
                      }))
                    }
                    keyboardType="numeric"
                    suffix="₪"
                  />
                </View>
                {/* الصورة اختيارية: زرٌّ صامت ما لم تُضف صورة، وعدّادٌ بعدها */}
                <Pressable
                  onPress={() => setMenuFor(menuFor === i ? null : i)}
                  hitSlop={8}
                  style={[styles.camBtn, (photos[i]?.length ?? 0) > 0 && styles.camBtnOn]}
                >
                  <Camera size={15} color={(photos[i]?.length ?? 0) > 0 ? palette.oliveDark : palette.muted} />
                  {(photos[i]?.length ?? 0) > 0 && (
                    <AppText variant="caption" color={palette.oliveDark}>
                      {photos[i].length}
                    </AppText>
                  )}
                </Pressable>
              </Row>

              {menuFor === i && (
                <Row gap={spacing.sm} style={{ paddingBottom: spacing.sm }}>
                  <Button
                    label="تصوير"
                    variant="ghost"
                    small
                    icon={<Camera size={14} color={palette.olive} />}
                    onPress={() => addPhoto(i, 'camera')}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label="من المعرض"
                    variant="ghost"
                    small
                    icon={<Images size={14} color={palette.olive} />}
                    onPress={() => addPhoto(i, 'library')}
                    style={{ flex: 1 }}
                  />
                </Row>
              )}

              {(photos[i]?.length ?? 0) > 0 && (
                <Row gap={spacing.sm} style={{ paddingBottom: spacing.sm, flexWrap: 'wrap' }}>
                  {photos[i].map((uri) => (
                    <Pressable key={uri} onPress={() => dropPhoto(i, uri)}>
                      <Image source={{ uri }} style={styles.thumb} />
                      <View style={styles.thumbX}>
                        <X size={11} color={palette.ivory} />
                      </View>
                    </Pressable>
                  ))}
                </Row>
              )}
            </View>
          ))}
          <Row justify="space-between" style={{ marginTop: spacing.sm }}>
            <AppText variant="label">المجموع</AppText>
            <AppText variant="number">{money(total * 100)}</AppText>
          </Row>
        </>
      )}

      <Divider />
      <AppText variant="caption" color={palette.muted}>
        الصورة اختيارية - صوِّر الشيك أو أضفه من المعرض، وأكثر من صورة إن لزم.
      </AppText>

      <View style={{ marginTop: spacing.sm }}>
        <Field label="ملاحظة" value={note} onChangeText={setNote} placeholder="مثال: دفعة التوقيع" />
      </View>

      {!!error && <Banner tone="danger" title="تعذر التسجيل" body={error} />}
      {!!warn && <Banner tone="warning" title="سُجّلت الشيكات" body={warn} />}

      <Button
        label={warn ? 'تم' : `تسجيل ${n} شيكات`}
        full
        loading={busy === 'payment'}
        disabled={!warn && !(baseAmount > 0)}
        icon={<CheckCheck size={17} color={palette.ivory} />}
        style={{ marginTop: spacing.sm }}
        onPress={warn ? onDone : submit}
      />

      <DateTimeSheet
        visible={editingDate !== null}
        value={editingDate !== null && editingDate >= 0 ? rows[editingDate]?.dueAt ?? firstDue : firstDue}
        title={editingDate === -1 ? 'صرف أول شيك' : `صرف الشيك ${(editingDate ?? 0) + 1}`}
        onConfirm={(iso) => {
          if (editingDate === -1) {
            setFirstDue(iso);
            setOverrides({});
          } else if (editingDate !== null) {
            setOverrides((prev) => ({ ...prev, [editingDate]: { ...prev[editingDate], dueAt: iso } }));
          }
          setEditingDate(null);
        }}
        onCancel={() => setEditingDate(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderRadius: radius.md,
    borderWidth: 1.4,
    borderColor: palette.sandDeep,
    backgroundColor: palette.ivory,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  dateBtn: {
    marginTop: 6,
    borderRadius: radius.md,
    borderWidth: 1.4,
    borderColor: palette.line,
    backgroundColor: palette.white,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  rowDate: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: palette.sand,
  },
  thumb: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: palette.sand },
  // × على حافة المصغّرة: اللمس على الصورة نفسها يحذفها، والعلامة تقول ذلك
  thumbX: {
    position: 'absolute',
    top: -4,
    left: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.charcoal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  camBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.4,
    borderColor: palette.line,
  },
  camBtnOn: { borderColor: palette.olive, backgroundColor: palette.sand },
});
