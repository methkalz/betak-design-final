import { useRouter } from 'expo-router';
import { Building2, RotateCcw, ShieldCheck } from 'lucide-react-native';
import React from 'react';
import { Alert, View } from 'react-native';

import { AppText, Button, Card, Divider, Pill, Row, ScrollScreen, SectionHeader } from '@/components/ui';
import { palette, spacing } from '@/constants/theme';
import {
  CAPABILITY_LABELS,
  LEVEL_LABELS,
  ROLE_LABELS,
  levelOf,
  type Capability,
} from '@/domain/permissions';
import { money, percent, phone } from '@/lib/format';
import { useStore } from '@/providers/store';
import type { Role } from '@/types/domain';

const ROLES: Role[] = ['admin', 'sales', 'field', 'tailor'];
const CAPS = Object.keys(CAPABILITY_LABELS) as Capability[];

export default function SettingsScreen() {
  const { db, role, resetDemo, signOut } = useStore();
  const router = useRouter();

  return (
    <ScrollScreen>
      <Card>
        <Row gap={spacing.md}>
          <Building2 size={22} color={palette.olive} />
          <View style={{ flex: 1 }}>
            <AppText variant="heading">{db.organization.name}</AppText>
            <AppText variant="caption" color={palette.muted}>
              {db.organization.address} • {phone(db.organization.phone)}
            </AppText>
          </View>
        </Row>
        <Divider />
        <Row justify="space-between">
          <AppText variant="caption" color={palette.muted}>
            מע"מ
          </AppText>
          <AppText variant="label">{percent(db.settings.vatPercent)}</AppText>
        </Row>
        <Row justify="space-between">
          <AppText variant="caption" color={palette.muted}>
            الحد الأدنى لنسبة الربح
          </AppText>
          <AppText variant="label">{percent(db.settings.minMarginPercent)}</AppText>
        </Row>
        <Row justify="space-between">
          <AppText variant="caption" color={palette.muted}>
            صلاحية العرض
          </AppText>
          <AppText variant="label">{db.settings.quotationValidityDays} يوم</AppText>
        </Row>
      </Card>

      <Card>
        <SectionHeader title="تكاليف ثابتة لكل متر طولي" subtitle="تُستخدم في حساب التكلفة الداخلية" />
        {role === 'admin' ? (
          <>
            <CostRow label="المسار" value={money(db.settings.trackCostPerMeterAgorot)} />
            <CostRow label="التوصيل" value={money(db.settings.deliveryCostPerMeterAgorot)} />
            <CostRow label="القياس والتركيب" value={money(db.settings.measureInstallCostPerMeterAgorot)} />
            <CostRow label="البطانة (افتراضي)" value={money(db.settings.liningCostPerMeterAgorot)} />
          </>
        ) : (
          <AppText variant="caption" color={palette.muted}>
            التكاليف الداخلية غير متاحة لدورك.
          </AppText>
        )}
      </Card>

      <Card>
        <SectionHeader title="مصفوفة الصلاحيات" subtitle="مطبّقة في قاعدة البيانات وليس في الواجهة فقط" />
        <Row justify="space-between" style={{ paddingBottom: spacing.sm }}>
          <AppText variant="caption" color={palette.muted} style={{ flex: 2 }}>
            الصلاحية
          </AppText>
          {ROLES.map((r) => (
            <AppText key={r} variant="caption" color={palette.muted} align="center" style={{ flex: 1 }}>
              {ROLE_LABELS[r]}
            </AppText>
          ))}
        </Row>
        {CAPS.map((cap) => (
          <Row key={cap} justify="space-between" style={{ paddingVertical: 6 }}>
            <AppText variant="caption" style={{ flex: 2 }}>
              {CAPABILITY_LABELS[cap]}
            </AppText>
            {ROLES.map((r) => {
              const lvl = levelOf(r, cap);
              return (
                <View key={r} style={{ flex: 1, alignItems: 'center' }}>
                  <AppText
                    variant="caption"
                    align="center"
                    color={
                      lvl === 'yes'
                        ? palette.success
                        : lvl === 'no'
                          ? palette.danger
                          : palette.warning
                    }
                  >
                    {LEVEL_LABELS[lvl]}
                  </AppText>
                </View>
              );
            })}
          </Row>
        ))}
      </Card>

      <Card>
        <SectionHeader title="المستخدمون" />
        {db.profiles.map((p) => (
          <Row key={p.id} justify="space-between" style={{ paddingVertical: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <AppText variant="label">{p.fullName}</AppText>
              <AppText variant="caption" color={palette.muted}>
                {p.title} • {phone(p.phone)}
              </AppText>
            </View>
            <Pill
              label={ROLE_LABELS[p.role]}
              bg={palette.sageSoft}
              fg={palette.oliveDark}
              small
              icon={<ShieldCheck size={11} color={palette.oliveDark} />}
            />
          </Row>
        ))}
      </Card>

      <Card>
        <SectionHeader title="بيانات العرض التجريبي" subtitle="لإعادة العرض إلى حالته الأصلية" />
        <Button
          label="إعادة تعيين بيانات العرض"
          variant="ghost"
          full
          icon={<RotateCcw size={16} color={palette.olive} />}
          onPress={() =>
            Alert.alert('إعادة التعيين', 'سيتم استرجاع كل بيانات العرض التجريبي الأصلية.', [
              { text: 'إلغاء', style: 'cancel' },
              {
                text: 'إعادة تعيين',
                style: 'destructive',
                onPress: async () => {
                  await resetDemo();
                  signOut();
                  router.replace('/login');
                },
              },
            ])
          }
        />
      </Card>
    </ScrollScreen>
  );
}

function CostRow({ label, value }: { label: string; value: string }) {
  return (
    <Row justify="space-between" style={{ paddingVertical: 5 }}>
      <AppText variant="caption" color={palette.muted}>
        {label}
      </AppText>
      <AppText variant="label">{value}</AppText>
    </Row>
  );
}
