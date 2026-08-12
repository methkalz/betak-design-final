/**
 * معالج الشيكات الجماعي (M6).
 *
 * ثلاثة مدخلات تولّد الرزمة كلها: العدد، مبلغ كل شيك، وتاريخ أول استحقاق -
 * والبقية شهريًا بقاعدة القصّ (31.1 ← 28.2 ← 31.3، لا فيضان للشهر التالي).
 * كل سطر يبقى قابلًا للتعديل يدويًا: الجدولة اقتراح ذكي لا قيد.
 *
 * صورة الشيكات اختيارية، تُضغط قبل الحفظ (webp حيث يتاح، وإلا jpeg مضغوط -
 * iOS لا يشفّر webp) فتصغر للأرشفة وتسهل معاينتها لاحقًا.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Camera, CheckCheck, X } from 'lucide-react-native';
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
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  const pickPhoto = async () => {
    setError(null);
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    try {
      // ضغط فعلي: عرض أقصى 1400 يكفي لقراءة أرقام الشيك، والحجم يهبط أضعافًا
      const out = await ImageManipulator.manipulateAsync(
        res.assets[0].uri,
        [{ resize: { width: 1400 } }],
        { compress: 0.55, format: ImageManipulator.SaveFormat.WEBP },
      );
      setPhotoUri(out.uri);
    } catch {
      try {
        const out = await ImageManipulator.manipulateAsync(
          res.assets[0].uri,
          [{ resize: { width: 1400 } }],
          { compress: 0.55, format: ImageManipulator.SaveFormat.JPEG },
        );
        setPhotoUri(out.uri);
      } catch {
        setError('تعذر ضغط الصورة - أعد المحاولة.');
      }
    }
  };

  const submit = async () => {
    setError(null);
    if (rows.some((r) => !(r.amountShekel > 0)))
      return setError('كل شيك يجب أن يكون مبلغه أكبر من صفر - بالشيكل الصحيح.');
    const res = await recordCheckSeries({
      projectId,
      checks: rows.map((r) => ({ amountAgorot: r.amountShekel * 100, dueAt: r.dueAt })),
      note,
      photoUri,
    });
    if (!res.ok) return setError(res.error);
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
            <Row key={i} justify="space-between" gap={spacing.md} style={{ paddingVertical: 6 }}>
              <AppText variant="caption" color={palette.muted}>
                شيك {i + 1}/{n}
              </AppText>
              <Pressable onPress={() => setEditingDate(i)} style={styles.rowDate}>
                <AppText variant="caption" color={palette.oliveDark}>
                  {formatDate(r.dueAt)}
                </AppText>
              </Pressable>
              <View style={{ width: 110 }}>
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
            </Row>
          ))}
          <Row justify="space-between" style={{ marginTop: spacing.sm }}>
            <AppText variant="label">المجموع</AppText>
            <AppText variant="number">{money(total * 100)}</AppText>
          </Row>
        </>
      )}

      <Divider />
      {photoUri ? (
        <Row gap={spacing.md} align="center">
          <Image source={{ uri: photoUri }} style={styles.thumb} />
          <AppText variant="caption" color={palette.muted} style={{ flex: 1 }}>
            صورة الرزمة محفوظة على الجهاز - أرشفتها إلى الخادم تصل مع شريحة المرفقات.
          </AppText>
          <Pressable onPress={() => setPhotoUri(null)} hitSlop={10}>
            <X size={18} color={palette.muted} />
          </Pressable>
        </Row>
      ) : (
        <Button
          label="إرفاق صورة الشيكات (اختياري)"
          variant="ghost"
          small
          full
          icon={<Camera size={15} color={palette.olive} />}
          onPress={pickPhoto}
        />
      )}

      <View style={{ marginTop: spacing.sm }}>
        <Field label="ملاحظة" value={note} onChangeText={setNote} placeholder="مثال: دفعة التوقيع" />
      </View>

      {!!error && <Banner tone="danger" title="تعذر التسجيل" body={error} />}

      <Button
        label={`تسجيل ${n} شيكات`}
        full
        loading={busy === 'payment'}
        disabled={!(baseAmount > 0)}
        icon={<CheckCheck size={17} color={palette.ivory} />}
        style={{ marginTop: spacing.sm }}
        onPress={submit}
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
});
