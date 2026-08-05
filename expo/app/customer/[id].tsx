import { useLocalSearchParams, useRouter } from 'expo-router';
import { Archive, MapPin, MessageCircle, Phone, Plus, StickyNote } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, View } from 'react-native';

import { ProjectRow } from '@/components/cards';
import { Spotlight, type SpotlightTarget } from '@/components/Spotlight';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  Pill,
  Row,
  ScrollScreen,
  SectionHeader,
} from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { can } from '@/domain/permissions';
import { projectFinance, useCustomer } from '@/hooks/selectors';
import { Avatar } from '@/components/Avatar';
import { formatDate, money, phone } from '@/lib/format';
import { useGoBack } from '@/lib/nav';
import { useStore } from '@/providers/store';

export default function CustomerScreen() {
  const { id, justCreated } = useLocalSearchParams<{ id: string; justCreated?: string }>();
  const { db, role, archiveCustomer } = useStore();
  const router = useRouter();
  const goBack = useGoBack('/customers');
  const customer = useCustomer(id);

  // ضوء كاشف بعد إضافة زبون: يدلّ على الخطوة التالية الطبيعية
  const newProjectRef = useRef<View>(null);
  const [spot, setSpot] = useState<SpotlightTarget | null>(null);
  const [showSpot, setShowSpot] = useState(false);

  useEffect(() => {
    if (justCreated !== '1') return;
    // مهلة قصيرة حتى يستقر التخطيط قبل القياس
    const t = setTimeout(() => {
      newProjectRef.current?.measureInWindow((x, y, width, height) => {
        if (width > 0) {
          setSpot({ x, y, width, height });
          setShowSpot(true);
        }
      });
    }, 480);
    return () => clearTimeout(t);
  }, [justCreated]);

  if (!customer) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<StickyNote size={26} color={palette.olive} />}
          title="الزبون غير موجود"
          body="ربما تم أرشفته أو حذف الرابط."
        />
      </ScrollScreen>
    );
  }

  const projects = db.projects.filter((p) => p.customerId === customer.id);
  const total = projects.reduce((s, p) => s + projectFinance(db, p.id).totalAgorot, 0);
  const due = projects.reduce((s, p) => s + projectFinance(db, p.id).dueAgorot, 0);
  const showMoney = role === 'admin' || role === 'sales';

  const call = () => {
    if (Platform.OS === 'web') return;
    Linking.openURL(`tel:${customer.phone.replace(/-/g, '')}`).catch(() => {});
  };
  const whatsapp = () => {
    const digits = customer.phone.replace(/\D/g, '');
    const intl = digits.startsWith('0') ? `972${digits.slice(1)}` : digits;
    Linking.openURL(`https://wa.me/${intl}`).catch(() => {});
  };
  const maps = () => {
    const q = encodeURIComponent(`${customer.address} ${customer.city}`);
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${q}`,
      default: `https://www.google.com/maps/search/?api=1&query=${q}`,
    });
    Linking.openURL(url).catch(() => {});
  };

  return (
    <ScrollScreen>
      <Card>
        <Row gap={spacing.md}>
          <Avatar id={customer.id} name={customer.fullName} size={60} />
          <View style={{ flex: 1 }}>
            <AppText variant="title">{customer.fullName}</AppText>
            <AppText variant="caption" color={palette.muted}>
              {customer.city} • زبون منذ {formatDate(customer.createdAt)}
            </AppText>
          </View>
        </Row>

        <Row gap={spacing.sm} style={{ marginTop: spacing.lg }}>
          <Button label="اتصال" icon={<Phone size={16} color={palette.ivory} />} onPress={call} style={{ flex: 1 }} />
          <Button
            label="واتساب"
            variant="accent"
            icon={<MessageCircle size={16} color={palette.white} />}
            onPress={whatsapp}
            style={{ flex: 1 }}
          />
          <Button label="خرائط" variant="secondary" icon={<MapPin size={16} color={palette.oliveDark} />} onPress={maps} />
        </Row>
      </Card>

      {showMoney && (
        <Row gap={spacing.md}>
          <View style={[styles.tile, { backgroundColor: palette.sageSoft }]}>
            <AppText variant="number">{money(total)}</AppText>
            <AppText variant="caption" color={palette.muted}>
              إجمالي التعامل
            </AppText>
          </View>
          <View style={[styles.tile, { backgroundColor: palette.terracottaSoft }]}>
            <AppText variant="number">{money(due)}</AppText>
            <AppText variant="caption" color={palette.muted}>
              متبقٍ للتحصيل
            </AppText>
          </View>
        </Row>
      )}

      <Card>
        <AppText variant="heading">تفاصيل التواصل</AppText>
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <DetailRow label="الهاتف" value={phone(customer.phone)} />
          <DetailRow label="العنوان" value={`${customer.address}، ${customer.city}`} />
          <DetailRow label="ملاحظات" value={customer.notes || '-'} />
        </View>
        {customer.preferences.length > 0 && (
          <Row gap={spacing.sm} wrap style={{ marginTop: spacing.md }}>
            {customer.preferences.map((p) => (
              <Pill key={p} label={p} bg={palette.sand} fg={palette.oliveDark} small />
            ))}
          </Row>
        )}
      </Card>

      <View>
        <SectionHeader
          title="مشاريع الزبون"
          subtitle={`${projects.length} مشروع`}
          action={
            can(role, 'manage_customers') ? (
              <View ref={newProjectRef} collapsable={false}>
                <Button
                  label="مشروع جديد"
                  small
                  variant="secondary"
                  icon={<Plus size={15} color={palette.oliveDark} />}
                  onPress={() =>
                    router.push({ pathname: '/project/new', params: { customerId: customer.id } })
                  }
                />
              </View>
            ) : undefined
          }
        />
        <View style={{ gap: spacing.md }}>
          {projects.map((p) => (
            <ProjectRow key={p.id} projectId={p.id} />
          ))}
          {projects.length === 0 && (
            <Card>
              <AppText variant="body" color={palette.muted} align="center">
                لا توجد مشاريع لهذا الزبون بعد.
              </AppText>
            </Card>
          )}
        </View>
      </View>

      {can(role, 'manage_customers') && (
        <Button
          label="أرشفة الزبون"
          variant="ghost"
          full
          icon={<Archive size={16} color={palette.olive} />}
          onPress={() =>
            Alert.alert('أرشفة الزبون', 'لا يتم الحذف الفعلي - يمكن استرجاعه لاحقًا.', [
              { text: 'إلغاء', style: 'cancel' },
              {
                text: 'أرشفة',
                style: 'destructive',
                onPress: () => {
                  archiveCustomer(customer.id);
                  goBack();
                },
              },
            ])
          }
        />
      )}

      <Spotlight
        visible={showSpot}
        target={spot}
        title="والآن: مشروع جديد"
        body="من هنا تبدأ أول مشروع لهذا الزبون"
        onDismiss={() => setShowSpot(false)}
      />
    </ScrollScreen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Row justify="space-between" align="flex-start" gap={spacing.lg}>
      <AppText variant="caption" color={palette.muted}>
        {label}
      </AppText>
      <AppText variant="label" style={{ flex: 1 }} align="left">
        {value}
      </AppText>
    </Row>
  );
}

const styles = {
  tile: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
};
