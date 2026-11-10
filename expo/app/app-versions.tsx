/**
 * إصدارات المتجر - للأدمن: متى يرى الطاقم «يتوفر تحديث»، ومتى يصير إلزاميًّا.
 *
 * رقم البناء يظهر على صفحة البناء في expo.dev (Version code على أندرويد،
 * Build number على iOS). بعد نشر نسخةٍ في المتجر يُرفع «أحدث نسخة» إلى رقمها؛
 * و«الحدّ الأدنى» لا يُرفع إلا حين تتوقّف النسخ القديمة عن العمل.
 */
import { Smartphone } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Banner, Button, Card, Field, Row, ScrollScreen, SectionHeader } from '@/components/ui';
import { palette, spacing } from '@/constants/theme';
import { fetchPolicyFor, savePolicyFor, type StorePlatform } from '@/lib/releasePolicyAdmin';
import { installedBuild, STORE_PLATFORM } from '@/lib/storeUpdate';
import { useStore } from '@/providers/store';

interface Draft {
  latest: string;
  min: string;
  iosId: string;
}

const LABEL: Record<StorePlatform, string> = { android: 'أندرويد (Google Play)', ios: 'آيفون (App Store)' };

function PlatformCard({ platform }: { platform: StorePlatform }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetchPolicyFor(platform);
    if (r.ok) {
      setDraft({ latest: String(r.data.latestBuild), min: String(r.data.minBuild), iosId: r.data.iosAppStoreId ?? '' });
    } else {
      setMsg({ ok: false, text: r.error });
    }
  }, [platform]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!draft) {
    return (
      <Card>
        <AppText variant="label">{LABEL[platform]}</AppText>
        <AppText variant="caption" color={palette.muted}>
          {msg?.text ?? 'جارٍ التحميل…'}
        </AppText>
      </Card>
    );
  }

  const latest = Number(draft.latest);
  const min = Number(draft.min);
  const invalid =
    !/^\d+$/.test(draft.latest) || !/^\d+$/.test(draft.min)
      ? 'الأرقام أعدادٌ صحيحة.'
      : min > latest
        ? 'الحدّ الأدنى لا يتجاوز أحدث نسخة.'
        : platform === 'ios' && draft.iosId && !/^\d{6,12}$/.test(draft.iosId)
          ? 'معرّف App Store أرقامٌ فقط.'
          : null;

  const save = async () => {
    setSaving(true);
    const r = await savePolicyFor(platform, latest, min, platform === 'ios' ? draft.iosId.trim() || null : null);
    setSaving(false);
    setMsg(r.ok ? { ok: true, text: 'حُفظ. يصل الطاقم عند فتح التطبيق التالي.' } : { ok: false, text: r.error });
  };

  return (
    <Card style={{ gap: spacing.md }}>
      <AppText variant="label">{LABEL[platform]}</AppText>
      <Field
        label="أحدث نسخة في المتجر (رقم البناء)"
        value={draft.latest}
        onChangeText={(v) => setDraft({ ...draft, latest: v.trim() })}
        keyboardType="numeric"
      />
      <AppText variant="caption" color={palette.muted}>
        من لديه رقمٌ أقلّ يرى «يتوفر تحديث» ويستطيع التأجيل. الصفر = لا شيء.
      </AppText>
      <Field
        label="الحدّ الأدنى الإلزاميّ"
        value={draft.min}
        onChangeText={(v) => setDraft({ ...draft, min: v.trim() })}
        keyboardType="numeric"
      />
      <AppText variant="caption" color={palette.muted}>
        من لديه رقمٌ أقلّ لا يستطيع استعمال التطبيق حتى يحدّث. اتركه صفرًا إلا عند تغييرٍ يكسر النسخ القديمة.
      </AppText>
      {platform === 'ios' && (
        <Field
          label="معرّف التطبيق في App Store (اختياريّ)"
          value={draft.iosId}
          onChangeText={(v) => setDraft({ ...draft, iosId: v.trim() })}
          keyboardType="numeric"
          placeholder="الأرقام بعد id في رابط التطبيق"
        />
      )}
      {invalid && (
        <AppText variant="caption" color={palette.danger}>
          {invalid}
        </AppText>
      )}
      {msg && <Banner tone={msg.ok ? 'success' : 'danger'} title={msg.text} />}
      <Button label={saving ? 'جارٍ الحفظ…' : 'حفظ'} full disabled={!!invalid || saving} onPress={save} />
    </Card>
  );
}

export default function AppVersionsScreen() {
  const { source, role } = useStore();

  if (role !== 'admin') {
    return (
      <ScrollScreen>
        <Banner tone="warning" title="للأدمن وحده" body="ضبط إصدارات المتجر صلاحية الأدمن." />
      </ScrollScreen>
    );
  }
  if (source !== 'live') {
    return (
      <ScrollScreen>
        <Banner tone="info" title="يعمل مع الحساب الحقيقي" body="سجّل الدخول برقم هاتفك وكلمة السرّ." />
      </ScrollScreen>
    );
  }

  const mine = installedBuild();
  return (
    <ScrollScreen>
      <Card>
        <Row gap={spacing.sm}>
          <Smartphone size={18} color={palette.olive} />
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color={palette.muted}>
              {mine !== null
                ? `هذا الجهاز: ${STORE_PLATFORM === 'ios' ? 'آيفون' : 'أندرويد'}، رقم البناء ${mine}`
                : 'هذا الجهاز لا يحمل رقم بناءٍ من المتجر (ويب أو Expo Go).'}
            </AppText>
          </View>
        </Row>
      </Card>
      <SectionHeader title="رسالة «يتوفر تحديث»" subtitle="رقم البناء من صفحة البناء في expo.dev" />
      <PlatformCard platform="android" />
      <PlatformCard platform="ios" />
    </ScrollScreen>
  );
}
