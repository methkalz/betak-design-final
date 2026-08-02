import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, Check, Layers, Lock } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  AppText,
  Banner,
  Button,
  Card,
  Divider,
  Field,
  Pill,
  ProgressBar,
  Row,
  ScrollScreen,
  SectionHeader,
  Swatch,
} from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { dyeLotWarning } from '@/domain/inventory';
import { projectFabricPlan, useRollViews } from '@/hooks/selectors';
import { meters } from '@/lib/format';
import { useStore } from '@/providers/store';

export default function ReserveScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const { db, busy, isOnline, reserveFabric } = useStore();
  const rolls = useRollViews();

  const [selectedRoll, setSelectedRoll] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const project = db.projects.find((p) => p.id === projectId);
  const plan = useMemo(() => projectFabricPlan(db, projectId), [db, projectId]);
  const existing = db.reservations.filter((r) => r.projectId === projectId && r.status !== 'released');

  const roll = rolls.find((r) => r.roll.id === selectedRoll) ?? null;
  const qty = parseFloat(quantity || '0');

  const activeLots = existing
    .map((r) => db.fabricRolls.find((x) => x.id === r.rollId))
    .filter((r) => r?.variantId === roll?.roll.variantId)
    .map((r) => r?.dyeLot ?? '');
  const lotWarning = roll ? dyeLotWarning([...activeLots, roll.roll.dyeLot]) : null;

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (!selectedRoll) return setError('اختر الرول أولًا.');
    const res = await reserveFabric(projectId, selectedRoll, qty);
    if (!res.ok) return setError(res.error);
    setInfo(`تم حجز ${meters(qty)} من ${roll?.roll.code} بنجاح.`);
    setQuantity('');
  };

  return (
    <ScrollScreen>
      <Card>
        <AppText variant="heading">{project?.title}</AppText>
        <AppText variant="caption" color={palette.muted}>
          الحجز عملية خادمية داخل Transaction — لا يمكن أن يصبح الرصيد سالبًا.
        </AppText>
        <Divider />
        <SectionHeader title="المطلوب حسب القياسات" />
        {plan.map((p) => {
          const reserved = existing
            .filter((r) => db.fabricRolls.find((x) => x.id === r.rollId)?.variantId === p.variantId)
            .reduce((s, r) => s + r.quantityM, 0);
          const variant = db.fabricVariants.find((v) => v.id === p.variantId);
          const done = reserved >= p.meters;
          return (
            <View key={p.variantId} style={{ gap: 6, marginBottom: spacing.md }}>
              <Row justify="space-between">
                <Row gap={spacing.sm}>
                  <Swatch color={variant?.colorHex ?? palette.sand} size={22} />
                  <AppText variant="label">{p.label}</AppText>
                </Row>
                <Row gap={6}>
                  {done && <Check size={14} color={palette.success} />}
                  <AppText variant="caption" color={done ? palette.success : palette.terracotta}>
                    {meters(reserved)} / {meters(p.meters)}
                  </AppText>
                </Row>
              </Row>
              <ProgressBar
                value={p.meters > 0 ? reserved / p.meters : 0}
                color={done ? palette.success : palette.terracotta}
              />
            </View>
          );
        })}
        {plan.length === 0 && (
          <AppText variant="caption" color={palette.muted}>
            لم تُحدَّد أقمشة على الشبابيك بعد.
          </AppText>
        )}
      </Card>

      {!isOnline && (
        <Banner
          tone="danger"
          title="لا يمكن الحجز دون اتصال"
          body="حجز القماش عملية خادمية ولا تُعتبر مؤكدة قبل نجاح RPC."
          icon={<Lock size={16} color={palette.danger} />}
        />
      )}

      <Card>
        <SectionHeader title="اختر الرول" subtitle="المتاح = الرصيد الفعلي − المحجوز" />
        <View style={{ gap: spacing.sm }}>
          {rolls.map((r) => {
            const active = selectedRoll === r.roll.id;
            const empty = r.balance.availableM <= 0;
            return (
              <Pressable
                key={r.roll.id}
                disabled={empty}
                onPress={() => {
                  setSelectedRoll(r.roll.id);
                  setError(null);
                }}
                style={[
                  {
                    borderRadius: radius.md,
                    borderWidth: 1.4,
                    borderColor: palette.line,
                    padding: spacing.md,
                    opacity: empty ? 0.45 : 1,
                    minHeight: 64,
                    justifyContent: 'center',
                  },
                  active && { borderColor: palette.olive, backgroundColor: palette.sageSoft },
                ]}
              >
                <Row justify="space-between">
                  <Row gap={spacing.md} style={{ flex: 1 }}>
                    <Swatch color={r.variant?.colorHex ?? palette.sand} size={34} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="label">
                        {r.roll.code} • {r.product?.name} {r.variant?.colorName}
                      </AppText>
                      <AppText variant="caption" color={palette.muted}>
                        موقع {r.roll.location} • Dye lot {r.roll.dyeLot}
                      </AppText>
                    </View>
                  </Row>
                  <Pill
                    label={`متاح ${r.balance.availableM}م`}
                    bg={r.balance.availableM < 20 ? palette.dangerSoft : palette.sand}
                    fg={r.balance.availableM < 20 ? palette.danger : palette.oliveDark}
                    small
                  />
                </Row>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {!!roll && (
        <Card>
          <SectionHeader title="الكمية" subtitle={`المتاح حاليًا ${meters(roll.balance.availableM)}`} />
          <Field
            label="الكمية المطلوبة"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            suffix="متر"
            placeholder="0"
          />
          <Row gap={spacing.sm} wrap style={{ marginTop: spacing.md }}>
            {plan.map((p) => (
              <Button
                key={p.variantId}
                label={`${p.label} (${p.meters} م)`}
                variant="secondary"
                small
                onPress={() => setQuantity(String(p.meters))}
              />
            ))}
          </Row>
          {!!lotWarning && (
            <View style={{ marginTop: spacing.md }}>
              <Banner
                tone="warning"
                title="تحذير دفعة الصبغ"
                body={lotWarning}
                icon={<AlertTriangle size={16} color={palette.warning} />}
              />
            </View>
          )}
          {qty > roll.balance.availableM && (
            <View style={{ marginTop: spacing.md }}>
              <Banner
                tone="danger"
                title="الكمية أكبر من المتاح"
                body={`المتاح ${meters(roll.balance.availableM)} فقط — لا يمكن أن يصبح الرصيد سالبًا.`}
              />
            </View>
          )}
        </Card>
      )}

      {!!error && <Banner tone="danger" title="تعذر الحجز" body={error} />}
      {!!info && <Banner tone="success" title={info} />}

      <Button
        label="تأكيد الحجز"
        full
        loading={busy === 'reserve'}
        disabled={!selectedRoll || !(qty > 0)}
        icon={<Layers size={18} color={palette.ivory} />}
        onPress={submit}
      />
      <Button label="إغلاق" variant="ghost" full onPress={() => router.back()} />
    </ScrollScreen>
  );
}
