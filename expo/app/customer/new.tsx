import { useRouter } from 'expo-router';
import { UserPlus } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { TownField } from '@/components/TownField';
import { AppText, Banner, Button, Card, Field, ScrollScreen } from '@/components/ui';
import { palette, spacing } from '@/constants/theme';
import { useStore } from '@/providers/store';

export default function NewCustomerScreen() {
  const { createCustomer } = useStore();
  const router = useRouter();
  const [fullName, setFullName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const submit = () => {
    setSaving(true);
    setError(null);
    const res = createCustomer({ fullName, phone, city, address, notes });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // العلامة تُشغّل الضوء الكاشف على زر «مشروع جديد» في صفحة الزبون:
    // الإرشاد يأتي بعد فعل المستخدم لا عند فتح الشاشة اعتباطًا
    router.replace({ pathname: '/customer/[id]', params: { id: res.data, justCreated: '1' } });
  };

  return (
    <ScrollScreen>
      <Card>
        <View style={{ gap: spacing.lg }}>
          <AppText variant="heading">بيانات الزبون</AppText>
          <Field label="الاسم الكامل" value={fullName} onChangeText={setFullName} placeholder="مثال: مثقال زيدان" />
          <Field
            label="رقم الهاتف"
            value={phone}
            onChangeText={setPhone}
            placeholder="052-6444414"
            keyboardType="phone-pad"
          />
          <TownField value={city} onChangeText={setCity} />
          <Field label="العنوان" value={address} onChangeText={setAddress} placeholder="الحي، رقم البناية" />
          <Field label="ملاحظات" value={notes} onChangeText={setNotes} multiline placeholder="تفضيلات الزبون، أوقات التواصل..." />
        </View>
      </Card>

      {!!error && <Banner tone="danger" title="تعذر الحفظ" body={error} />}

      <Button
        label="حفظ الزبون"
        full
        loading={saving}
        icon={<UserPlus size={18} color={palette.ivory} />}
        onPress={submit}
      />
      <AppText variant="caption" color={palette.muted} align="center">
        يتم حفظ الزبون داخل مؤسستك فقط، ولا تراه أي مؤسسة أخرى.
      </AppText>
    </ScrollScreen>
  );
}
