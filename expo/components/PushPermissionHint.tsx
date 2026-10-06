/**
 * تنبيه إذن الإشعارات - يظهر في شاشة الإشعارات حين لا يرنّ الهاتف.
 *
 * النظام يسأل عن الإذن مرّةً واحدة؛ ومن رفضه لا يُسأل ثانيةً، ولا يعرف أن
 * إشعاراته تصل القائمة ولا تصل هاتفه. هنا يعرف، ويصل الإعدادات بلمسة.
 * لا يظهر على الويب، ولا حين الإذن ممنوح.
 */
import { BellOff } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { AppText, Button, Card, Row } from '@/components/ui';
import { palette, spacing } from '@/constants/theme';
import { obtainPushToken, pushPermissionStatus, registerPushToken } from '@/lib/push';

export function PushPermissionHint() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof pushPermissionStatus>>>('granted');

  const refresh = useCallback(() => {
    void pushPermissionStatus().then(setStatus);
  }, []);

  // العودة من الإعدادات تعيد الفحص: من فعّلها هناك يختفي التنبيه وحده
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  if (status === 'granted' || status === 'unsupported') return null;

  const enable = async () => {
    if (status === 'denied') {
      await Linking.openSettings().catch(() => {});
      return;
    }
    const r = await obtainPushToken();
    if (r.ok) await registerPushToken(r.token, r.platform);
    refresh();
  };

  return (
    <Card style={{ borderColor: palette.warning, gap: spacing.sm }}>
      <Row gap={spacing.sm}>
        <BellOff size={18} color={palette.warning} />
        <AppText variant="label" style={{ flex: 1 }}>
          إشعارات الهاتف متوقّفة على هذا الجهاز
        </AppText>
      </Row>
      <AppText variant="caption" color={palette.muted}>
        ستبقى الإشعارات تصل إلى هذه القائمة، لكن هاتفك لن يرنّ عند وصول جديد.
      </AppText>
      <Button
        label={status === 'denied' ? 'فتح إعدادات الهاتف' : 'تفعيل إشعارات الهاتف'}
        variant="ghost"
        full
        onPress={enable}
      />
    </Card>
  );
}
