import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarPlus, Check, UserPlus } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  AppText,
  Banner,
  Button,
  Card,
  Field,
  Row,
  ScrollScreen,
  SegmentedControl,
} from '@/components/ui';
import { DateTimeSheet } from '@/components/DateTimeSheet';
import { palette, radius, spacing } from '@/constants/theme';
import { PRIORITY_LABELS } from '@/domain/labels';
import { formatDate, formatTime, initials, phone } from '@/lib/format';
import { useStore } from '@/providers/store';
import type { Priority } from '@/types/domain';

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export default function NewProjectScreen() {
  const params = useLocalSearchParams<{ customerId?: string }>();
  const { db, createProject } = useStore();
  const router = useRouter();

  // لا اختيار تلقائي لأول زبون: إسناد المشروع لصاحبه قرارٌ صريح
  const [customerId, setCustomerId] = useState<string>(params.customerId ?? '');
  const [search, setSearch] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [fieldWorkerId, setFieldWorkerId] = useState<string | null>(
    db.profiles.find((p) => p.role === 'field')?.id ?? null,
  );
  const [tailorId, setTailorId] = useState<string | null>(null);
  const [measurementAt, setMeasurementAt] = useState<string>(inDays(1));
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  // 09:00 هو الافتراضي حين لا يُحدَّد توقيت — فوجوده يعني ساعةً مقصودة
  const hasTime = useMemo(() => {
    const d = new Date(measurementAt);
    return d.getHours() !== 9 || d.getMinutes() !== 0;
  }, [measurementAt]);
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const customers = useMemo(() => db.customers.filter((c) => !c.archivedAt), [db.customers]);
  const fieldWorkers = db.profiles.filter((p) => p.role === 'field');
  const tailors = db.profiles.filter((p) => p.role === 'tailor');

  const submit = () => {
    setError(null);
    if (!customerId) return setError('اختر الزبون صاحب المشروع أولًا.');
    const res = createProject({
      customerId,
      title,
      priority,
      fieldWorkerId,
      tailorId,
      measurementDate: measurementAt,
      notes,
    });
    if (!res.ok) return setError(res.error);
    router.replace(`/project/${res.data}`);
  };

  /**
   * المشروع لا يقوم بلا زبون، فاختياره أول خطوة لا حقلٌ في وسط النموذج:
   * بحث حيّ فوق القائمة، وزر «زبون جديد» ظاهر دائمًا لا مخبوء في شاشة أخرى
   * (فالنموذج القديم كان يفترض وجود الزبون سلفًا ويختار الأول تلقائيًا).
   */
  const shown = useMemo(() => {
    const q = search.trim();
    if (!q) return customers;
    return customers.filter(
      (c) => c.fullName.includes(q) || c.phone.includes(q) || c.city.includes(q),
    );
  }, [customers, search]);

  const preset = params.customerId ? customers.find((c) => c.id === params.customerId) : null;

  return (
    <ScrollScreen>
      {/* قادمًا من صفحة زبون: صاحب المشروع معروف، فعرض القائمة كلها بعلامة
          اختيار أمام اسمه تكرارٌ لما يعرفه المستخدم. سطرٌ يؤكد السياق يكفي. */}
      {preset ? (
        <Card>
          <Row gap={spacing.md} align="center">
            <View style={styles.presetAvatar}>
              <AppText variant="label" color={palette.olive}>
                {initials(preset.fullName)}
              </AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={palette.muted}>
                مشروع جديد للزبون
              </AppText>
              <AppText variant="heading" numberOfLines={1}>
                {preset.fullName}
              </AppText>
            </View>
          </Row>
        </Card>
      ) : (
      <Card>
        <Row justify="space-between" gap={spacing.md}>
          <AppText variant="heading">الزبون</AppText>
          <Button
            label="زبون جديد"
            variant="secondary"
            small
            icon={<UserPlus size={15} color={palette.oliveDark} />}
            onPress={() => router.push('/customer/new')}
          />
        </Row>

        <View style={{ marginTop: spacing.md }}>
          <Field
            label="ابحث عن الزبون"
            value={search}
            onChangeText={setSearch}
            placeholder="الاسم أو الهاتف أو البلدة"
          />
        </View>

        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {shown.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setCustomerId(c.id)}
              style={[styles.option, customerId === c.id && styles.optionActive]}
            >
              <Row justify="space-between">
                <View>
                  <AppText variant="label">{c.fullName}</AppText>
                  <AppText variant="caption" color={palette.muted}>
                    {c.city} • {phone(c.phone)}
                  </AppText>
                </View>
                {customerId === c.id && <Check size={18} color={palette.olive} />}
              </Row>
            </Pressable>
          ))}
          {shown.length === 0 && (
            <View style={{ paddingVertical: spacing.lg, gap: spacing.md, alignItems: 'center' }}>
              <AppText variant="body" color={palette.muted} align="center">
                {customers.length === 0
                  ? 'لا زبائن بعد. ابدأ بإضافة الزبون صاحب المشروع.'
                  : 'لا نتائج مطابقة لبحثك.'}
              </AppText>
              <Button
                label="إضافة زبون جديد"
                icon={<UserPlus size={16} color={palette.white} />}
                onPress={() => router.push('/customer/new')}
              />
            </View>
          )}
        </View>
      </Card>
      )}

      <Card>
        <View style={{ gap: spacing.lg }}>
          <AppText variant="heading">بيانات المشروع</AppText>
          <Field
            label="عنوان المشروع"
            value={title}
            onChangeText={setTitle}
            placeholder="مثال: بيت مثقال - كفرمندا"
          />
          <View style={{ gap: 6 }}>
            <AppText variant="label" color={palette.muted}>
              الأولوية
            </AppText>
            <SegmentedControl
              value={priority}
              onChange={setPriority}
              options={(['low', 'normal', 'high'] as Priority[]).map((p) => ({
                value: p,
                label: PRIORITY_LABELS[p],
              }))}
            />
          </View>
          <Field label="ملاحظات" value={notes} onChangeText={setNotes} multiline />
        </View>
      </Card>

      <Card>
        <AppText variant="heading">الفريق والموعد</AppText>
        <AppText variant="caption" color={palette.muted}>
          العامل الميداني
        </AppText>
        <Row gap={spacing.sm} wrap style={{ marginTop: spacing.sm }}>
          {fieldWorkers.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setFieldWorkerId(p.id)}
              style={[styles.chip, fieldWorkerId === p.id && styles.chipActive]}
            >
              <AppText variant="label" color={fieldWorkerId === p.id ? palette.ivory : palette.charcoal}>
                {p.fullName}
              </AppText>
            </Pressable>
          ))}
        </Row>

        <AppText variant="caption" color={palette.muted} style={{ marginTop: spacing.lg }}>
          الخياط (اختياري)
        </AppText>
        <Row gap={spacing.sm} wrap style={{ marginTop: spacing.sm }}>
          {tailors.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setTailorId(tailorId === p.id ? null : p.id)}
              style={[styles.chip, tailorId === p.id && styles.chipActive]}
            >
              <AppText variant="label" color={tailorId === p.id ? palette.ivory : palette.charcoal}>
                {p.fullName}
              </AppText>
            </Pressable>
          ))}
        </Row>

        <AppText variant="caption" color={palette.muted} style={{ marginTop: spacing.lg }}>
          موعد القياس
        </AppText>
        <Pressable onPress={() => setPickerOpen(true)} style={styles.dateBtn}>
          <Row justify="space-between">
            <Row gap={spacing.sm}>
              <CalendarPlus size={18} color={palette.olive} />
              <AppText variant="label">{formatDate(measurementAt)}</AppText>
            </Row>
            <AppText variant="caption" color={palette.muted}>
              {hasTime ? formatTime(measurementAt) : 'بلا توقيت محدد'}
            </AppText>
          </Row>
        </Pressable>
      </Card>

      <DateTimeSheet
        visible={pickerOpen}
        value={measurementAt}
        title="موعد القياس"
        onConfirm={(iso) => {
          setMeasurementAt(iso);
          setPickerOpen(false);
        }}
        onCancel={() => setPickerOpen(false)}
      />

      {!!error && <Banner tone="danger" title="تعذر إنشاء المشروع" body={error} />}

      <Button
        label="إنشاء المشروع وجدولة القياس"
        full
        icon={<CalendarPlus size={18} color={palette.ivory} />}
        onPress={submit}
      />
    </ScrollScreen>
  );
}

const styles = {
  option: {
    borderRadius: radius.md,
    borderWidth: 1.4,
    borderColor: palette.line,
    padding: spacing.md,
    minHeight: 56,
    justifyContent: 'center' as const,
  },
  optionActive: { borderColor: palette.olive, backgroundColor: palette.sageSoft },
  chip: {
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    justifyContent: 'center' as const,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
  },
  chipActive: { backgroundColor: palette.olive, borderColor: palette.olive },
  presetAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: palette.sand,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  dateBtn: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.4,
    borderColor: palette.line,
    backgroundColor: palette.white,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    justifyContent: 'center' as const,
  },
};
