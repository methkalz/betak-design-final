/**
 * الإشعار العامّ - رسالة من الأدمن إلى الطاقم على هواتفهم.
 *
 * تظهر في الموقع (betakd.com) وفي التطبيق معًا، فهما التطبيق نفسه. الأدمن
 * يكتب، ويختار الجمهور، ويرى معاينة وعدد المستلمين، ثم يؤكّد. الخادم يرفض
 * غير الأدمن، ولا يطفئ أحدٌ هذا النوع من إعداداته.
 */
import { Megaphone, Send } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import {
  AppText,
  Banner,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  Field,
  Row,
  ScrollScreen,
  SectionHeader,
} from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { AUDIENCE_ROLES, BODY_MAX, countRecipients, TITLE_MAX, validateAnnouncement } from '@/domain/announcement';
import { ROLE_LABELS } from '@/domain/permissions';
import { fetchRecentAnnouncements, sendAnnouncement, type SentAnnouncement } from '@/lib/announcements';
import { relativeTime } from '@/lib/format';
import { uuidv4 } from '@/lib/id';
import { useStore } from '@/providers/store';
import type { Role } from '@/types/domain';

export default function AnnouncementScreen() {
  const { source, role, db, currentUser } = useStore();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const [history, setHistory] = useState<SentAnnouncement[]>([]);
  // مفتاحٌ واحد لكلّ رسالة: إعادة المحاولة بعد انقطاعٍ لا ترسلها مرّتين
  const keyRef = useRef(uuidv4());

  const loadHistory = useCallback(async () => {
    const r = await fetchRecentAnnouncements();
    if (r.ok) setHistory(r.data);
  }, []);

  useEffect(() => {
    if (source === 'live' && role === 'admin') void loadHistory();
  }, [source, role, loadHistory]);

  if (role !== 'admin') {
    return (
      <ScrollScreen>
        <Banner tone="warning" title="للأدمن وحده" body="إرسال الإشعارات العامة صلاحية الأدمن." />
      </ScrollScreen>
    );
  }
  if (source !== 'live') {
    return (
      <ScrollScreen>
        <Banner
          tone="info"
          title="الإرسال يعمل مع الحساب الحقيقي"
          body="سجّل الدخول برقم هاتفك وكلمة السرّ لترسل إشعارًا إلى الطاقم."
        />
      </ScrollScreen>
    );
  }

  const recipients = countRecipients(db.profiles, roles, currentUser?.id);
  const invalid = validateAnnouncement(title, body);
  const toggleRole = (r: Role) =>
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  const audienceLabel = roles.length === 0 ? 'كلّ الطاقم' : roles.map((r) => ROLE_LABELS[r]).join('، ');

  const send = async () => {
    setSending(true);
    const r = await sendAnnouncement(title, body, roles, keyRef.current);
    setSending(false);
    setConfirming(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setSent(r.data.recipients);
    setTitle('');
    setBody('');
    setRoles([]);
    keyRef.current = uuidv4();
    void loadHistory();
  };

  return (
    <ScrollScreen>
      {sent !== null && (
        <Banner tone="success" title="أُرسل الإشعار" body={`وصل إلى قائمة ${sent} من الطاقم، ويُرسل الآن إلى هواتفهم.`} />
      )}
      {error && <Banner tone="danger" title="لم يُرسل" body={error} />}

      <Card style={{ gap: spacing.md }}>
        <Field
          label={`العنوان (${title.trim().length}/${TITLE_MAX})`}
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            setSent(null);
          }}
          placeholder="مثال: المحلّ مغلق يوم الجمعة"
        />
        <Field
          label={`النصّ - اختياري (${body.trim().length}/${BODY_MAX})`}
          value={body}
          onChangeText={setBody}
          placeholder="التفاصيل التي يحتاجها الطاقم"
          multiline
        />
      </Card>

      <SectionHeader title="إلى من؟" subtitle="بلا اختيار يصل إلى كلّ الطاقم" />
      <Row gap={spacing.sm} wrap>
        <Chip label="الجميع" active={roles.length === 0} onPress={() => setRoles([])} />
        {AUDIENCE_ROLES.map((r) => (
          <Chip key={r} label={ROLE_LABELS[r]} active={roles.includes(r)} onPress={() => toggleRole(r)} />
        ))}
      </Row>

      <SectionHeader title="معاينة" subtitle="هكذا يظهر على الهاتف" />
      <View
        style={{
          backgroundColor: palette.ivoryDeep,
          borderRadius: radius.lg,
          padding: spacing.md,
          gap: 2,
        }}
      >
        <Row gap={spacing.sm}>
          <Megaphone size={16} color={palette.terracotta} />
          <AppText variant="label" style={{ flex: 1 }} numberOfLines={1}>
            {title.trim() || 'عنوان الإشعار'}
          </AppText>
        </Row>
        {!!body.trim() && (
          <AppText variant="caption" color={palette.muted} numberOfLines={4}>
            {body.trim()}
          </AppText>
        )}
      </View>
      <AppText variant="caption" color={palette.muted}>
        {`سيصل إلى ${recipients} من ${audienceLabel}. لا يستطيع أحدٌ إطفاء الإشعارات العامة.`}
      </AppText>

      <Button
        label="إرسال"
        full
        icon={<Send size={16} color={palette.white} />}
        disabled={!!invalid || recipients === 0}
        onPress={() => setConfirming(true)}
      />
      {!!invalid && title.length > 0 && (
        <AppText variant="caption" color={palette.danger}>
          {invalid}
        </AppText>
      )}

      {history.length > 0 && (
        <>
          <SectionHeader title="ما أُرسل" subtitle="آخر الإشعارات العامة" />
          {history.map((h) => (
            <Card key={h.id} style={{ gap: 4 }}>
              <AppText variant="label">{h.title}</AppText>
              {!!h.body && (
                <AppText variant="caption" color={palette.muted} numberOfLines={2}>
                  {h.body}
                </AppText>
              )}
              <AppText variant="caption" color={palette.muted}>
                {`${relativeTime(h.createdAt)} · ${h.senderName} · ${
                  h.roles?.length ? h.roles.map((r) => ROLE_LABELS[r]).join('، ') : 'الجميع'
                }`}
              </AppText>
              <AppText variant="caption" color={palette.oliveDark}>
                {`${h.recipients} مستلمًا · قرأه ${h.readCount} · وصل الهاتف ${h.delivered || h.pushed}`}
              </AppText>
            </Card>
          ))}
        </>
      )}

      <ConfirmSheet
        visible={confirming}
        title="إرسال الإشعار العامّ؟"
        body={`«${title.trim()}» إلى ${recipients} من ${audienceLabel}. لا يمكن سحبه بعد الإرسال.`}
        confirmLabel="أرسل الآن"
        icon={<Megaphone size={22} color={palette.olive} />}
        loading={sending}
        onConfirm={send}
        onCancel={() => setConfirming(false)}
      />
    </ScrollScreen>
  );
}
