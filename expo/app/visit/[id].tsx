import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Camera,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  MapPin,
  Phone,
  Play,
  Plus,
  UserCheck,
} from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, View } from 'react-native';

import {
  AppText,
  Banner,
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  Pill,
  Row,
  ScrollScreen,
  SectionHeader,
} from '@/components/ui';
import { SignedImage } from '@/components/SignedImage';
import { palette, radius, spacing } from '@/constants/theme';
import { ATTACHMENT_KIND_LABELS, VISIT_STATUS_LABELS, VISIT_TYPE_LABELS } from '@/domain/labels';
import { cm, formatDateTime } from '@/lib/format';
import { useGoBack } from '@/lib/nav';
import { useStore } from '@/providers/store';
import type { InstallationChecklist } from '@/types/domain';

const CHECKLIST_LABELS: Record<keyof InstallationChecklist, string> = {
  track: 'المسار مثبت ومستوٍ',
  curtain: 'الستارة معلقة بشكل صحيح',
  height: 'الارتفاع مطابق للقياس',
  cleanliness: 'المكان نظيف بعد العمل',
};

export default function VisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useGoBack('/visits');
  const { db, isOnline, busy, startVisit, completeVisit, updateVisit, addAttachment } = useStore();
  const [error, setError] = useState<string | null>(null);
  // null = لم يلمس الحقل؛ '' = مسحٌ مقصود يُحفَظ - فلا يبعث النص القديم
  const [note, setNote] = useState<string | null>(null);

  const visit = db.fieldVisits.find((v) => v.id === id);
  if (!visit) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<ClipboardCheck size={26} color={palette.olive} />}
          title="الزيارة غير موجودة"
          body="تحقق من قائمة زياراتك."
        />
      </ScrollScreen>
    );
  }

  const project = db.projects.find((p) => p.id === visit.projectId);
  const customer = db.customers.find((c) => c.id === project?.customerId);
  const rooms = db.rooms.filter((r) => r.projectId === visit.projectId);
  const windows = db.windows.filter((w) => w.projectId === visit.projectId);
  const photos = db.attachments.filter((a) => a.visitId === visit.id);
  const isInstall = visit.type === 'installation';

  const capture = async (kind: 'measurement' | 'before_install' | 'after_install') => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      let result: ImagePicker.ImagePickerResult;
      if (perm.granted && Platform.OS !== 'web') {
        result = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
      }
      if (result.canceled || !result.assets?.[0]) return;
      const res = await addAttachment({
        projectId: visit.projectId,
        visitId: visit.id,
        kind,
        uri: result.assets[0].uri,
        caption: ATTACHMENT_KIND_LABELS[kind],
      });
      if (!res.ok) setError(res.error);
    } catch (e) {
      console.log('[visit] capture failed', e);
      setError('تعذر فتح الكاميرا. تحقق من الأذونات وحاول مجددًا.');
    }
  };

  const toggleCheck = async (key: keyof InstallationChecklist) => {
    const res = await updateVisit(visit.id, {
      checklist: { ...visit.checklist, [key]: !visit.checklist[key] },
    });
    if (!res.ok) setError(res.error);
  };

  const finish = async () => {
    setError(null);
    // الملاحظة المعلقة تُدفَق قبل الإقفال: بعده يرفضها الخادم عن حق،
    // واللمسة الأصلية (اكتب ثم أنهِ) يجب ألا تُضيع نصًا
    if (note !== null && note !== visit.notes) {
      const saved = await updateVisit(visit.id, { notes: note });
      if (!saved.ok) return setError(saved.error);
    }
    const res = await completeVisit(visit.id);
    if (!res.ok) return setError(res.error);
    Alert.alert('تم إكمال الزيارة', 'حُفظت الزيارة على خادم المعرض.', [
      { text: 'تمام', onPress: () => goBack() },
    ]);
  };

  return (
    <ScrollScreen>
      <Card>
        <Row justify="space-between" align="flex-start">
          <View style={{ flex: 1 }}>
            <AppText variant="title">{customer?.fullName}</AppText>
            <AppText variant="caption" color={palette.muted}>
              {project?.title} • {project?.code}
            </AppText>
          </View>
          <Pill
            label={VISIT_TYPE_LABELS[visit.type]}
            bg={isInstall ? palette.sageSoft : palette.infoSoft}
            fg={isInstall ? palette.olive : palette.info}
          />
        </Row>
        <Divider />
        <Row justify="space-between">
          <AppText variant="caption" color={palette.muted}>
            {formatDateTime(visit.scheduledAt)}
          </AppText>
          <Pill label={VISIT_STATUS_LABELS[visit.status]} bg={palette.sand} fg={palette.oliveDark} small />
        </Row>
        <Row gap={spacing.sm} style={{ marginTop: spacing.lg }}>
          <Button
            label="اتصال"
            variant="secondary"
            icon={<Phone size={16} color={palette.oliveDark} />}
            onPress={() => {
              if (Platform.OS === 'web' || !customer) return;
              Linking.openURL(`tel:${customer.phone.replace(/-/g, '')}`).catch(() => {});
            }}
            style={{ flex: 1 }}
          />
          <Button
            label="خرائط"
            variant="secondary"
            icon={<MapPin size={16} color={palette.oliveDark} />}
            onPress={() => {
              const q = encodeURIComponent(`${customer?.address ?? ''} ${customer?.city ?? ''}`);
              const url = Platform.select({
                ios: `http://maps.apple.com/?q=${q}`,
                default: `https://www.google.com/maps/search/?api=1&query=${q}`,
              });
              Linking.openURL(url).catch(() => {});
            }}
            style={{ flex: 1 }}
          />
        </Row>
      </Card>

      {!isOnline && (
        <Banner
          tone="warning"
          title="أنت تعمل دون اتصال"
          body="لا يمكن الحفظ بلا اتصال - انتظر عودة الشبكة قبل أن تسجّل، وإلا ضاع ما تكتبه."
        />
      )}

      {visit.status === 'scheduled' && (
        <Button
          label="بدء الزيارة"
          full
          icon={<Play size={18} color={palette.ivory} />}
          onPress={async () => {
            const res = await startVisit(visit.id);
            if (!res.ok) setError(res.error);
          }}
        />
      )}

      {!isInstall && (
        <Card>
          <SectionHeader
            title="الغرف والشبابيك"
            subtitle={`${rooms.length} غرفة • ${windows.length} شباك`}
            action={
              <Button
                label="فتح المشروع"
                variant="ghost"
                small
                onPress={() => router.push(`/project/${visit.projectId}`)}
              />
            }
          />
          {rooms.map((room) => {
            const roomWindows = windows.filter((w) => w.roomId === room.id);
            return (
              <View key={room.id} style={{ marginBottom: spacing.md }}>
                <Row justify="space-between">
                  <AppText variant="label">{room.name}</AppText>
                  <Button
                    label="شباك جديد"
                    variant="ghost"
                    small
                    icon={<Plus size={14} color={palette.olive} />}
                    onPress={() =>
                      router.push({
                        pathname: '/window/new',
                        params: { projectId: visit.projectId, roomId: room.id },
                      })
                    }
                  />
                </Row>
                {roomWindows.map((w) => (
                  <Pressable
                    key={w.id}
                    onPress={() => router.push(`/window/${w.id}`)}
                    style={{ paddingVertical: 6 }}
                  >
                    <AppText variant="caption" color={palette.muted}>
                      {w.name} - {cm(w.widthCm)} × {cm(w.heightCm)}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            );
          })}
          {rooms.length === 0 && (
            <AppText variant="caption" color={palette.muted}>
              أضف الغرف من شاشة المشروع ثم سجّل الشبابيك هنا.
            </AppText>
          )}
        </Card>
      )}

      {isInstall && (
        <Card>
          <SectionHeader title="قائمة التحقق" subtitle="إلزامية قبل إنهاء التركيب" />
          {(Object.keys(CHECKLIST_LABELS) as (keyof InstallationChecklist)[]).map((key) => (
            <Pressable
              key={key}
              onPress={() => toggleCheck(key)}
              style={{ paddingVertical: spacing.sm, minHeight: 48, justifyContent: 'center' }}
            >
              <Row gap={spacing.md}>
                {visit.checklist[key] ? (
                  <CheckCircle2 size={22} color={palette.success} />
                ) : (
                  <CircleDashed size={22} color={palette.sandDeep} />
                )}
                <AppText variant="label" color={visit.checklist[key] ? palette.charcoal : palette.muted}>
                  {CHECKLIST_LABELS[key]}
                </AppText>
              </Row>
            </Pressable>
          ))}
          <Divider />
          <Pressable
            onPress={async () => {
              const res = await updateVisit(visit.id, {
                customerSignedOff: !visit.customerSignedOff,
              });
              if (!res.ok) setError(res.error);
            }}
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Row gap={spacing.md}>
              {visit.customerSignedOff ? (
                <UserCheck size={22} color={palette.success} />
              ) : (
                <CircleDashed size={22} color={palette.sandDeep} />
              )}
              <AppText variant="label">تأكيد الزبون على التسليم</AppText>
            </Row>
          </Pressable>
        </Card>
      )}

      <Card>
        <SectionHeader
          title="الصور"
          subtitle={isInstall ? 'قبل وبعد التركيب' : 'صور القياس لكل شباك'}
        />
        <Row gap={spacing.sm} wrap>
          {isInstall ? (
            <>
              <Button
                label="صورة قبل"
                variant="secondary"
                small
                loading={busy === 'attach'}
                icon={<Camera size={15} color={palette.oliveDark} />}
                onPress={() => capture('before_install')}
              />
              <Button
                label="صورة بعد"
                variant="accent"
                small
                loading={busy === 'attach'}
                icon={<Camera size={15} color={palette.white} />}
                onPress={() => capture('after_install')}
              />
            </>
          ) : (
            <Button
              label="التقاط صورة قياس"
              variant="secondary"
              small
              loading={busy === 'attach'}
              icon={<Camera size={15} color={palette.oliveDark} />}
              onPress={() => capture('measurement')}
            />
          )}
        </Row>

        <Row gap={spacing.sm} wrap style={{ marginTop: spacing.md }}>
          {photos.map((p) => (
            <View key={p.id} style={{ width: 96, gap: 4 }}>
              <SignedImage
                uri={p.uri}
                style={{ width: 96, height: 96, borderRadius: radius.md, backgroundColor: palette.sand }}
                contentFit="cover"
              />
              <AppText variant="caption" color={p.uploaded ? palette.success : palette.warning}>
                {p.uploaded ? 'مرفوعة' : 'بانتظار الرفع'}
              </AppText>
            </View>
          ))}
          {photos.length === 0 && (
            <AppText variant="caption" color={palette.muted}>
              لا توجد صور بعد.
            </AppText>
          )}
        </Row>
      </Card>

      <Card>
        <AppText variant="heading">ملاحظات الزيارة</AppText>
        <View style={{ marginTop: spacing.md, gap: spacing.md }}>
          <Field
            label="ملاحظة"
            value={note ?? visit.notes}
            onChangeText={setNote}
            onBlur={async () => {
              // الحفظ عند مغادرة الحقل لا مع كل حرف: في الوضع الحي كل
              // حفظٍ رحلة خادمية كاملة - والفشل يُعرَض لا يُبتلَع
              if (note === null || note === visit.notes) return;
              const res = await updateVisit(visit.id, { notes: note });
              if (!res.ok) setError(res.error);
            }}
            multiline
            placeholder="حالة الجبس، ملاحظات الزبون، صعوبات التركيب..."
          />
        </View>
      </Card>

      {!!error && <Banner tone="danger" title="تعذر إكمال الزيارة" body={error} />}

      {visit.status !== 'completed' && (
        <Button
          label="إكمال الزيارة ومزامنتها"
          full
          icon={<ClipboardCheck size={18} color={palette.ivory} />}
          onPress={finish}
        />
      )}
      {visit.status === 'completed' && (
        <Banner
          tone="success"
          title="الزيارة مكتملة"
          body={`أُنجزت في ${formatDateTime(visit.completedAt)}`}
          icon={<CheckCircle2 size={16} color={palette.success} />}
        />
      )}
    </ScrollScreen>
  );
}
