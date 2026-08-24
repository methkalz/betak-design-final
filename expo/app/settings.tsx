import { Building2, FileText, ShieldCheck } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { QuoteTemplateCard } from '@/components/QuoteTemplateCard';
import {
  AppText, Banner, Button, Card, Divider, He, Pill, Row, ScrollScreen, SectionHeader,
} from '@/components/ui';
import { palette, spacing } from '@/constants/theme';
import { can } from '@/domain/permissions';
import { QUOTE_TEMPLATES, QUOTE_THEMES, type QuoteTemplate } from '@/domain/quoteThemes';
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
  const { db, role, busy, updateSettings } = useStore();
  // مسوّدةٌ محلّية: الاختيار يُرى فورًا، والحفظ فعلٌ صريح
  const [draft, setDraft] = useState<QuoteTemplate | null>(null);
  const [info, setInfo] = useState<{ text: string; tone: 'success' | 'warning' } | null>(null);

  const current = draft ?? db.settings.quoteTemplate;
  // الخادم يرفض غير الأدمن بـBD403، فبوّابةٌ في الواجهة تمنع زرًّا يُخفق دائمًا
  const canEdit = can(role, 'edit_pricing_rules');

  const saveTemplate = async () => {
    if (!draft) return;
    const res = await updateSettings({ quoteTemplate: draft });
    if (!res.ok) return setInfo({ text: res.error, tone: 'warning' });
    setDraft(null);
    setInfo({ text: `قالب «${QUOTE_THEMES[draft].labelAr}» صار قالب عروضك.`, tone: 'success' });
  };

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
            <He>{'מע"מ'}</He>
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
        <SectionHeader
          title="قالب عرض السعر"
          subtitle="تصميم الوثيقة التي يستلمها الزبون - قالبٌ للمحل كله"
        />
        {!!info && <Banner tone={info.tone} title={info.text} />}
        {canEdit ? (
          <>
            <View
              style={{
                flexDirection: 'row-reverse',
                flexWrap: 'wrap',
                justifyContent: 'flex-start',
                gap: spacing.xs,
                marginTop: spacing.sm,
              }}
            >
              {QUOTE_TEMPLATES.map((id) => (
                <QuoteTemplateCard
                  key={id}
                  id={id}
                  active={current === id}
                  onPress={() => {
                    setInfo(null);
                    setDraft(id === db.settings.quoteTemplate ? null : id);
                  }}
                />
              ))}
            </View>
            <AppText variant="caption" color={palette.muted} style={{ marginTop: spacing.sm }}>
              المصغّرة رسمٌ تخطيطيّ للشكل واللون. المعاينة الكاملة من شاشة العرض
              قبل الإرسال. والتغيير يسري على العروض الجديدة - المقفولة تبقى كما أُرسلت.
            </AppText>
            {!!draft && (
              <Button
                label="حفظ القالب"
                full
                icon={<FileText size={17} color={palette.ivory} />}
                loading={busy === 'save-settings'}
                onPress={saveTemplate}
                style={{ marginTop: spacing.md }}
              />
            )}
          </>
        ) : (
          <AppText variant="body" color={palette.muted}>
            القالب الحالي: {QUOTE_THEMES[current].labelAr}. تغييره من صلاحيات الأدمن.
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
