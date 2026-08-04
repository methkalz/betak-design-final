import { useLocalSearchParams } from 'expo-router';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Package, Scissors } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import {
  AppText,
  Banner,
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  Pill,
  ProgressBar,
  Row,
  ScrollScreen,
  SectionHeader,
  SegmentedControl,
  Swatch,
} from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { MOVEMENT_LABELS, movementDirection } from '@/domain/inventory';
import { can } from '@/domain/permissions';
import { useRollView } from '@/hooks/selectors';
import { formatDateTime, meters, money } from '@/lib/format';
import { useStore } from '@/providers/store';

type Action = 'return' | 'damage' | 'adjustment_in' | 'adjustment_out';

const ACTIONS: { value: Action; label: string }[] = [
  { value: 'return', label: 'إرجاع' },
  { value: 'damage', label: 'تلف' },
  { value: 'adjustment_in', label: 'تسوية +' },
  { value: 'adjustment_out', label: 'تسوية −' },
];

export default function RollScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, role, busy, adjustStock, createMiniRoll } = useStore();
  const view = useRollView(id);

  const [action, setAction] = useState<Action>('return');
  const [quantity, setQuantity] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!view) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<Package size={26} color={palette.olive} />}
          title="الرول غير موجود"
          body="ربما تم استهلاكه بالكامل أو حذفه."
        />
      </ScrollScreen>
    );
  }

  const { roll, variant, product, balance } = view;
  const movements = db.stockMovements
    .filter((m) => m.rollId === roll.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const reservations = db.reservations.filter((r) => r.rollId === roll.id && r.status !== 'released');
  const showCost = role === 'admin';
  const editable = can(role, 'reserve_fabric');

  const submit = async () => {
    setError(null);
    setInfo(null);
    const qty = parseFloat(quantity || '0');
    const res = await adjustStock(roll.id, action, qty, reason);
    if (!res.ok) return setError(res.error);
    setQuantity('');
    setReason('');
    setInfo('تم تسجيل الحركة في السجل الدائم.');
  };

  return (
    <ScrollScreen>
      <Card>
        <Row gap={spacing.md}>
          <Swatch color={variant?.colorHex ?? palette.sand} size={58} />
          <View style={{ flex: 1 }}>
            <Row gap={spacing.sm}>
              <AppText variant="title">{roll.code}</AppText>
              {roll.isMiniRoll && <Pill label="Mini Roll" bg={palette.sand} fg={palette.muted} small />}
            </Row>
            <AppText variant="caption" color={palette.muted}>
              {product?.name} {variant?.colorName} • موقع {roll.location}
            </AppText>
            <AppText variant="caption" color={palette.muted}>
              Dye lot {roll.dyeLot} • عرض {product?.widthCm} سم
            </AppText>
          </View>
        </Row>

        <Divider />

        <Row gap={spacing.md}>
          <View style={[styles.tile, { backgroundColor: palette.sageSoft }]}>
            <AppText variant="number">{meters(balance.availableM)}</AppText>
            <AppText variant="caption" color={palette.muted}>
              متاح
            </AppText>
          </View>
          <View style={[styles.tile, { backgroundColor: palette.terracottaSoft }]}>
            <AppText variant="number">{meters(balance.reservedM)}</AppText>
            <AppText variant="caption" color={palette.muted}>
              محجوز
            </AppText>
          </View>
          <View style={[styles.tile, { backgroundColor: palette.ivoryDeep }]}>
            <AppText variant="number">{meters(balance.onHandM)}</AppText>
            <AppText variant="caption" color={palette.muted}>
              رصيد فعلي
            </AppText>
          </View>
        </Row>

        <View style={{ marginTop: spacing.md, gap: 6 }}>
          <ProgressBar
            value={balance.onHandM > 0 ? balance.availableM / balance.onHandM : 0}
            color={balance.availableM < 20 ? palette.danger : palette.olive}
            track={palette.terracottaSoft}
          />
          {showCost && (
            <AppText variant="caption" color={palette.muted}>
              قيمة الرصيد: {money(balance.onHandM * (variant?.costPerMeterAgorot ?? 0))} • تكلفة{' '}
              {money(variant?.costPerMeterAgorot ?? 0)}/م
            </AppText>
          )}
        </View>
      </Card>

      {balance.availableM < 20 && (
        <Banner
          tone="warning"
          title="مخزون منخفض"
          body="أعد الطلب من المورد قبل قبول حجوزات جديدة."
          icon={<AlertTriangle size={16} color={palette.warning} />}
        />
      )}

      {reservations.length > 0 && (
        <Card>
          <SectionHeader title="الحجوزات النشطة" />
          {reservations.map((r) => {
            const project = db.projects.find((p) => p.id === r.projectId);
            return (
              <Row key={r.id} justify="space-between" style={{ paddingVertical: 6 }}>
                <AppText variant="label">{project?.title ?? '-'}</AppText>
                <AppText variant="caption" color={palette.muted}>
                  {meters(r.quantityM - r.consumedM)} متبقٍ
                </AppText>
              </Row>
            );
          })}
        </Card>
      )}

      {editable && (
        <Card>
          <SectionHeader title="حركة يدوية" subtitle="كل حركة تحتاج سببًا وتُسجَّل بشكل دائم" />
          <SegmentedControl value={action} onChange={setAction} options={ACTIONS} />
          <View style={{ marginTop: spacing.md, gap: spacing.md }}>
            <Field
              label="الكمية"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
              suffix="متر"
            />
            <Field label="السبب" value={reason} onChangeText={setReason} placeholder="سبب الحركة" />
            <Button label="تسجيل الحركة" full loading={busy === 'adjust'} onPress={submit} />
            {!!error && <Banner tone="danger" title="تعذر التسجيل" body={error} />}
            {!!info && <Banner tone="success" title={info} />}
          </View>

          <Divider />
          <Button
            label="تحويل البقايا إلى Mini Roll"
            variant="ghost"
            full
            icon={<Scissors size={16} color={palette.olive} />}
            onPress={async () => {
              const qty = parseFloat(quantity || '0');
              const res = await createMiniRoll(roll.id, qty);
              if (!res.ok) setError(res.error);
              else setInfo('تم إنشاء Mini Roll من البقايا.');
            }}
          />
        </Card>
      )}

      <Card>
        <SectionHeader title="سجل الحركة" subtitle="مصدر الحقيقة للرصيد" />
        {movements.map((m) => {
          const dir = movementDirection(m.type);
          const project = db.projects.find((p) => p.id === m.projectId);
          return (
            <Row key={m.id} justify="space-between" align="flex-start" style={{ paddingVertical: spacing.sm }}>
              <Row gap={spacing.md} style={{ flex: 1 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor:
                      dir === 'in' ? palette.successSoft : dir === 'out' ? palette.dangerSoft : palette.sand,
                  }}
                >
                  {dir === 'in' ? (
                    <ArrowDownLeft size={16} color={palette.success} />
                  ) : dir === 'out' ? (
                    <ArrowUpRight size={16} color={palette.danger} />
                  ) : (
                    <Package size={14} color={palette.muted} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="label">
                    {MOVEMENT_LABELS[m.type]} • {meters(m.quantityM)}
                  </AppText>
                  <AppText variant="caption" color={palette.muted}>
                    {formatDateTime(m.createdAt)} •{' '}
                    {db.profiles.find((p) => p.id === m.createdBy)?.fullName ?? 'النظام'}
                    {project ? ` • ${project.code}` : ''}
                  </AppText>
                  {!!m.notes && (
                    <AppText variant="caption" color={palette.muted}>
                      {m.notes}
                    </AppText>
                  )}
                </View>
              </Row>
            </Row>
          );
        })}
      </Card>
    </ScrollScreen>
  );
}

const styles = {
  tile: { flex: 1, borderRadius: radius.md, padding: spacing.md },
};
