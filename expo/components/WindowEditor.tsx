import { Calculator, Check, Save, Trash2 } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import {
  AppText,
  Banner,
  Button,
  Card,
  Divider,
  Field,
  Pill,
  Row,
  ScrollScreen,
  SectionHeader,
  SegmentedControl,
  Swatch,
} from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { CURTAIN_MODEL_LABELS, TRACK_LABELS } from '@/domain/labels';
import { priceWindow, resolveBand } from '@/domain/pricing';
import { meters, money, percent } from '@/lib/format';
import { useGoBack } from '@/lib/nav';
import { useStore } from '@/providers/store';
import type { CurtainModel, TrackType, WindowUnit } from '@/types/domain';

interface Props {
  projectId: string;
  roomId: string;
  existing?: WindowUnit | null;
}

export function WindowEditor({ projectId, roomId, existing }: Props) {
  const { db, role, saveWindow, deleteWindow } = useStore();
  const goBack = useGoBack('/projects');

  const [name, setName] = useState<string>(existing?.name ?? '');
  const [width, setWidth] = useState<string>(existing ? String(existing.widthCm) : '');
  const [height, setHeight] = useState<string>(existing ? String(existing.heightCm) : '');
  const [model, setModel] = useState<CurtainModel>(existing?.model ?? 'wave');
  const [track, setTrack] = useState<TrackType>(existing?.track ?? 'ceiling_rail');
  const [hasLining, setHasLining] = useState<boolean>(existing?.hasLining ?? true);
  const [fullness, setFullness] = useState<number>(existing?.fullness ?? 3);
  const [fabricVariantId, setFabricVariantId] = useState<string | null>(
    existing?.fabricVariantId ?? null,
  );
  const [liningVariantId, setLiningVariantId] = useState<string | null>(
    existing?.liningVariantId ?? db.fabricVariants.find((v) => v.sku === 'LN-OFFWHITE')?.id ?? null,
  );
  const [notes, setNotes] = useState<string>(existing?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const fabricVariants = db.fabricVariants.filter((v) => {
    const p = db.fabricProducts.find((x) => x.id === v.productId);
    return p?.kind !== 'lining';
  });
  const liningVariants = db.fabricVariants.filter((v) => {
    const p = db.fabricProducts.find((x) => x.id === v.productId);
    return p?.kind === 'lining';
  });

  const widthCm = parseFloat(width || '0');
  const heightCm = parseFloat(height || '0');
  const showCost = role === 'admin';

  const preview = useMemo(() => {
    if (!(widthCm > 0) || !(heightCm > 0)) return null;
    const variant = db.fabricVariants.find((v) => v.id === fabricVariantId) ?? null;
    const product = db.fabricProducts.find((p) => p.id === variant?.productId) ?? null;
    const lining = db.fabricVariants.find((v) => v.id === liningVariantId) ?? null;
    return priceWindow({
      window: {
        id: 'preview',
        organizationId: db.organization.id,
        projectId,
        roomId,
        name,
        widthCm,
        heightCm,
        model,
        hasLining,
        track,
        fullness,
        fabricVariantId,
        liningVariantId,
        quantity: 1,
        notes,
        measuredAt: null,
        measuredBy: null,
      },
      product,
      variant,
      liningVariant: lining,
      rules: db.pricingRules,
      settings: db.settings,
    });
  }, [
    widthCm,
    heightCm,
    db,
    fabricVariantId,
    liningVariantId,
    projectId,
    roomId,
    name,
    model,
    hasLining,
    track,
    fullness,
    notes,
  ]);

  const submit = () => {
    setError(null);
    const res = saveWindow({
      id: existing?.id,
      projectId,
      roomId,
      name,
      widthCm,
      heightCm,
      model,
      hasLining,
      track,
      fullness,
      fabricVariantId,
      liningVariantId,
      quantity: 1,
      notes,
    });
    if (!res.ok) return setError(res.error);
    goBack();
  };

  return (
    <ScrollScreen>
      <Card>
        <AppText variant="heading">القياس</AppText>
        <View style={{ marginTop: spacing.md, gap: spacing.md }}>
          <Field label="اسم الشباك" value={name} onChangeText={setName} placeholder="الشباك الرئيسي" />
          <Row gap={spacing.md}>
            <View style={{ flex: 1 }}>
              <Field
                label="العرض"
                value={width}
                onChangeText={setWidth}
                keyboardType="decimal-pad"
                suffix="سم"
                placeholder="320"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="الارتفاع"
                value={height}
                onChangeText={setHeight}
                keyboardType="decimal-pad"
                suffix="سم"
                placeholder="310"
              />
            </View>
          </Row>
          {heightCm > 0 && (
            <Row gap={spacing.sm}>
              <Pill
                label={resolveBand(heightCm) === 'standard' ? 'شريحة حتى 329 سم' : 'شريحة 330–500 سم'}
                bg={resolveBand(heightCm) === 'standard' ? palette.sageSoft : palette.terracottaSoft}
                fg={resolveBand(heightCm) === 'standard' ? palette.oliveDark : palette.terracotta}
                small
              />
            </Row>
          )}
        </View>
      </Card>

      <Card>
        <AppText variant="heading">الموديل والتركيب</AppText>
        <View style={{ marginTop: spacing.md, gap: spacing.md }}>
          <AppText variant="label" color={palette.muted}>
            موديل الستارة
          </AppText>
          <Row gap={spacing.sm} wrap>
            {(Object.keys(CURTAIN_MODEL_LABELS) as CurtainModel[]).map((m) => (
              <Pressable key={m} onPress={() => setModel(m)} style={[chipStyle, model === m && chipActive]}>
                <AppText variant="label" color={model === m ? palette.ivory : palette.charcoal}>
                  {CURTAIN_MODEL_LABELS[m]}
                </AppText>
              </Pressable>
            ))}
          </Row>

          <AppText variant="label" color={palette.muted}>
            المسار
          </AppText>
          <Row gap={spacing.sm} wrap>
            {(Object.keys(TRACK_LABELS) as TrackType[]).map((t) => (
              <Pressable key={t} onPress={() => setTrack(t)} style={[chipStyle, track === t && chipActive]}>
                <AppText variant="label" color={track === t ? palette.ivory : palette.charcoal}>
                  {TRACK_LABELS[t]}
                </AppText>
              </Pressable>
            ))}
          </Row>

          <AppText variant="label" color={palette.muted}>
            المضاعف (Fullness)
          </AppText>
          <SegmentedControl
            value={String(fullness)}
            onChange={(v) => setFullness(parseFloat(v))}
            options={[
              { value: '2', label: '×2' },
              { value: '2.5', label: '×2.5' },
              { value: '3', label: '×3' },
            ]}
          />

          <Divider />
          <Row justify="space-between">
            <AppText variant="label">بطانة</AppText>
            <SegmentedControl
              value={hasLining ? 'yes' : 'no'}
              onChange={(v) => setHasLining(v === 'yes')}
              options={[
                { value: 'yes', label: 'مع بطانة' },
                { value: 'no', label: 'بدون' },
              ]}
            />
          </Row>
        </View>
      </Card>

      <Card>
        <SectionHeader title="القماش" subtitle="اختر اللون من مكتبة الأقمشة" />
        <Row gap={spacing.sm} wrap>
          {fabricVariants.map((v) => {
            const p = db.fabricProducts.find((x) => x.id === v.productId);
            const active = fabricVariantId === v.id;
            return (
              <Pressable
                key={v.id}
                onPress={() => setFabricVariantId(v.id)}
                style={[swatchCard, active && { borderColor: palette.olive, backgroundColor: palette.sageSoft }]}
              >
                <Swatch color={v.colorHex} size={40} />
                <View>
                  <AppText variant="caption">{p?.name}</AppText>
                  <AppText variant="caption" color={palette.muted}>
                    {v.colorName}
                  </AppText>
                </View>
                {active && <Check size={16} color={palette.olive} />}
              </Pressable>
            );
          })}
        </Row>

        {hasLining && (
          <>
            <Divider />
            <AppText variant="label" color={palette.muted}>
              لون البطانة
            </AppText>
            <Row gap={spacing.sm} wrap style={{ marginTop: spacing.sm }}>
              {liningVariants.map((v) => {
                const active = liningVariantId === v.id;
                return (
                  <Pressable
                    key={v.id}
                    onPress={() => setLiningVariantId(v.id)}
                    style={[swatchCard, active && { borderColor: palette.olive, backgroundColor: palette.sageSoft }]}
                  >
                    <Swatch color={v.colorHex} size={32} />
                    <AppText variant="caption">{v.colorName}</AppText>
                  </Pressable>
                );
              })}
            </Row>
          </>
        )}
      </Card>

      {preview && (
        <Card style={{ backgroundColor: palette.oliveDeepest, borderColor: palette.oliveDeepest }}>
          <Row justify="space-between">
            <Row gap={spacing.sm}>
              <Calculator size={18} color={palette.sage} />
              <AppText variant="heading" color={palette.ivory}>
                التسعير التلقائي
              </AppText>
            </Row>
            <AppText variant="numberLarge" color={palette.ivory}>
              {money(preview.lineTotalAgorot)}
            </AppText>
          </Row>
          <View style={{ marginTop: spacing.md, gap: 6 }}>
            <PreviewRow label="متر طولي" value={meters(preview.runningMeters)} />
            <PreviewRow label="قماش مطلوب" value={meters(preview.fabricMeters)} />
            {hasLining && <PreviewRow label="بطانة مطلوبة" value={meters(preview.liningMeters)} />}
            <PreviewRow label="سعر المتر" value={money(preview.unitPriceAgorot)} />
            {showCost && (
              <>
                <PreviewRow label="التكلفة الداخلية" value={money(preview.internalCostAgorot)} />
                <PreviewRow label="نسبة الربح" value={percent(preview.marginPercent)} highlight />
              </>
            )}
          </View>
          {preview.warnings.map((w) => (
            <View key={w} style={{ marginTop: spacing.md }}>
              <Banner tone="warning" title={w} />
            </View>
          ))}
        </Card>
      )}

      <Card>
        <Field label="ملاحظات التركيب" value={notes} onChangeText={setNotes} multiline />
      </Card>

      {!!error && <Banner tone="danger" title="تعذر الحفظ" body={error} />}

      <Button
        label={existing ? 'حفظ التعديلات' : 'حفظ الشباك'}
        full
        icon={<Save size={18} color={palette.ivory} />}
        onPress={submit}
      />

      {!!existing && (
        <Button
          label="حذف الشباك"
          variant="ghost"
          full
          icon={<Trash2 size={16} color={palette.danger} />}
          onPress={() =>
            Alert.alert('حذف الشباك', 'سيتم حذف القياس نهائيًا من المشروع.', [
              { text: 'إلغاء', style: 'cancel' },
              {
                text: 'حذف',
                style: 'destructive',
                onPress: () => {
                  deleteWindow(existing.id);
                  goBack();
                },
              },
            ])
          }
        />
      )}
      <AppText variant="caption" color={palette.muted} align="center">
        يُحفظ القياس على الجهاز فورًا ويُزامَن تلقائيًا عند توفر الشبكة.
      </AppText>
    </ScrollScreen>
  );
}

function PreviewRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Row justify="space-between">
      <AppText variant="caption" color={palette.sage}>
        {label}
      </AppText>
      <AppText variant="label" color={highlight ? palette.sage : palette.ivory}>
        {value}
      </AppText>
    </Row>
  );
}

const chipStyle = {
  paddingHorizontal: spacing.lg,
  minHeight: 44,
  justifyContent: 'center' as const,
  borderRadius: radius.pill,
  borderWidth: 1,
  borderColor: palette.line,
  backgroundColor: palette.white,
};
const chipActive = { backgroundColor: palette.olive, borderColor: palette.olive };
const swatchCard = {
  flexDirection: 'row-reverse' as const,
  alignItems: 'center' as const,
  gap: spacing.sm,
  padding: spacing.sm,
  borderRadius: radius.md,
  borderWidth: 1.4,
  borderColor: palette.line,
  backgroundColor: palette.white,
  minHeight: 56,
};
