/**
 * موظف جديد.
 *
 * الدور أولًا لا أخيرًا: هو ما يقرّر ما يراه الموظف وما يستطيع فعله، وتغييره
 * بعد ملء النموذج يعني إعادة قراءته كله. والمسمّى الوظيفي يقترح نفسه من
 * الدور فلا يُكتب في الحالة الغالبة.
 */
import { useRouter } from 'expo-router';
import { UserPlus } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Banner, Button, Card, Field, Row, ScrollScreen, SegmentedControl } from '@/components/ui';
import { palette, spacing } from '@/constants/theme';
import { CAPABILITY_LABELS, levelOf, ROLE_LABELS, type Capability } from '@/domain/permissions';
import { useStore } from '@/providers/store';
import type { Role } from '@/types/domain';

const ASSIGNABLE: Role[] = ['field', 'tailor', 'sales'];

/** الصلاحيات التي يهمّ الأدمنَ أن يعرفها قبل أن يُنشئ الحساب. */
const PREVIEW: Capability[] = [
  'enter_measurements',
  'update_production',
  'create_quotation',
  'view_cost_and_margin',
  'record_payment',
];

export default function NewStaffScreen() {
  const { createProfile, source } = useStore();
  const router = useRouter();

  const [role, setRole] = useState<Role>('field');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (titleEdited) return;
    setTitle(ROLE_LABELS[role]);
  }, [role, titleEdited]);

  const submit = () => {
    setError(null);
    const res = createProfile({ fullName, phone, role, title, pin: '0000' });
    if (!res.ok) return setError(res.error);
    router.replace({ pathname: '/team/[id]', params: { id: res.data } });
  };

  return (
    <ScrollScreen>
      <Card>
        <AppText variant="heading">الدور</AppText>
        <AppText variant="caption" color={palette.muted}>
          يحدّد ما يراه الموظف وما يستطيع فعله
        </AppText>
        <View style={{ marginTop: spacing.md }}>
          <SegmentedControl
            value={role}
            onChange={setRole}
            options={ASSIGNABLE.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
          />
        </View>

        <View style={{ marginTop: spacing.lg, gap: 6 }}>
          {PREVIEW.map((c) => {
            const level = levelOf(role, c);
            const yes = level === 'yes' || level === 'limited';
            return (
              <Row key={c} justify="space-between">
                <AppText variant="caption" color={palette.muted}>
                  {CAPABILITY_LABELS[c]}
                </AppText>
                <AppText variant="caption" color={yes ? palette.success : palette.muted}>
                  {yes ? 'نعم' : 'لا'}
                </AppText>
              </Row>
            );
          })}
        </View>
      </Card>

      <Card>
        <AppText variant="heading">بيانات الحساب</AppText>
        <View style={{ marginTop: spacing.md, gap: spacing.lg }}>
          <Field label="الاسم الكامل" value={fullName} onChangeText={setFullName} placeholder="مثال: أبو داني" />
          <Field
            label="رقم الهاتف"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="054-0000000"
          />
          <Field
            label="المسمّى الوظيفي"
            value={title}
            onChangeText={(t) => {
              setTitleEdited(true);
              setTitle(t);
            }}
          />
          <AppText variant="caption" color={palette.muted}>
            الدخول برقم الهاتف وكلمة سرٍّ يضبطها مزوّد النظام ثم تُسلَّم للموظف.
          </AppText>
        </View>
      </Card>

      {source === 'live' && (
        <Banner
          tone="warning"
          title="إنشاء الحسابات لا يمرّ من التطبيق بعد"
          body="حساب الدخول يحتاج صلاحية إدارية على الخادم. أرسل الاسم والدور والرقم لمزوّد النظام، ويصل الحساب وكلمة سره الأولية لتسلّمها للموظف."
        />
      )}

      {!!error && <Banner tone="danger" title="تعذر إنشاء الحساب" body={error} />}

      {source !== 'live' && (
        <Button
          label="إنشاء الحساب"
          full
          icon={<UserPlus size={18} color={palette.ivory} />}
          onPress={submit}
        />
      )}
    </ScrollScreen>
  );
}
