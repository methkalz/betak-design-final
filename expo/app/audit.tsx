import { ScrollText } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { AppText, Card, Divider, EmptyState, Pill, Row, ScrollScreen } from '@/components/ui';
import { palette, spacing } from '@/constants/theme';
import { formatDateTime } from '@/lib/format';
import { useStore } from '@/providers/store';

export default function AuditScreen() {
  const { db, role } = useStore();

  if (role !== 'admin') {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<ScrollText size={26} color={palette.olive} />}
          title="غير مصرح"
          body="سجل التدقيق متاح للأدمن فقط."
        />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <Card>
        <AppText variant="heading">سجل التدقيق</AppText>
        <AppText variant="caption" color={palette.muted}>
          كل عملية حساسة تُسجَّل باسم المستخدم والوقت - لا يمكن تعديلها أو حذفها.
        </AppText>
      </Card>

      <Card>
        {db.auditLogs.map((log, i) => (
          <View key={log.id}>
            <Row justify="space-between" align="flex-start">
              <View style={{ flex: 1 }}>
                <AppText variant="label">{log.summary}</AppText>
                <AppText variant="caption" color={palette.muted}>
                  {db.profiles.find((p) => p.id === log.actorId)?.fullName ?? 'النظام'} •{' '}
                  {formatDateTime(log.createdAt)}
                </AppText>
              </View>
              <Pill label={log.action} bg={palette.ivoryDeep} fg={palette.muted} small />
            </Row>
            {i < db.auditLogs.length - 1 && <Divider />}
          </View>
        ))}
      </Card>
    </ScrollScreen>
  );
}
