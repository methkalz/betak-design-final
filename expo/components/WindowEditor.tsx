import { Calculator, Check, Plus, Save, Trash2 } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  AppText,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  Divider,
  Field,
  Pill,
  Row,
  RTL_ROW,
  ScrollScreen,
  type ScrollScreenHandle,
  SectionHeader,
  SegmentedControl,
  Swatch,
} from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { TRACK_LABELS } from '@/domain/labels';
import { priceWindow, resolveBand, TALL_BAND_MAX_CM } from '@/domain/pricing';
import { meters, money, percent } from '@/lib/format';
import { useGoBack } from '@/lib/nav';
import { useStore } from '@/providers/store';
import type { FabricVariant, TrackType, WindowUnit } from '@/types/domain';

/**
 * التسمية الترتيبية تكتب نفسها (M1): أول شباك في الغرفة يُقترح «الشباك
 * الأول»، والذي بعده «الثاني»، وهكذا حسب العدّ الفعلي - لا قائمة ثابتة
 * يختار منها المستخدم ما عدّه بنفسه.
 */
const ORDINALS = [
  'الأول',
  'الثاني',
  'الثالث',
  'الرابع',
  'الخامس',
  'السادس',
  'السابع',
  'الثامن',
  'التاسع',
  'العاشر',
] as const;

/** اسم الشباك التالي لغرفةٍ فيها `count` شباكًا. */
export function nextWindowName(count: number): string {
  return count < ORDINALS.length ? `الشباك ${ORDINALS[count]}` : `الشباك ${count + 1}`;
}

/**
 * كل متر طولي يستهلك ثلاثة أمتار قماش - قاعدة المحل لا خيار الشباك.
 *
 * كان شريطًا يُختار منه، وكل اختيارٍ لا يُتّخذ فعلًا بابُ خطأ: يُترك على
 * قيمةٍ سهوًا فيخرج عرض سعر بأمتار غير التي ستُقص. الحقل باقٍ في النموذج
 * لأن محرك SQL ومتجهاته الذهبية مبنيّة عليه، لكنه لم يعد سؤالًا.
 */
const FULLNESS = 3;

interface Props {
  projectId: string;
  roomId: string;
  existing?: WindowUnit | null;
}

export function WindowEditor({ projectId, roomId, existing }: Props) {
  const { db, role, saveWindow, deleteWindow } = useStore();
  const goBack = useGoBack('/projects');
  const scroller = useRef<ScrollScreenHandle>(null);

  const roomCount = db.windows.filter((w) => w.roomId === roomId).length;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [name, setName] = useState<string>(existing?.name ?? nextWindowName(roomCount));
  const [width, setWidth] = useState<string>(existing ? String(existing.widthCm) : '');
  const [height, setHeight] = useState<string>(existing ? String(existing.heightCm) : '');
  const [track, setTrack] = useState<TrackType>(existing?.track ?? 'standard');
  const [hasLining, setHasLining] = useState<boolean>(existing?.hasLining ?? true);
  const [fabricVariantId, setFabricVariantId] = useState<string | null>(
    existing?.fabricVariantId ?? null,
  );
  const [liningVariantId, setLiningVariantId] = useState<string | null>(
    // الافتراضي 70% - الداخلة في السعر المحدد، فلا يُزاد سعرٌ بلا اختيار
    existing?.liningVariantId ?? db.fabricVariants.find((v) => v.sku === 'LN-70')?.id ?? null,
  );
  const [notes, setNotes] = useState<string>(existing?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const fabricProducts = db.fabricProducts.filter((p) => p.kind !== 'lining');
  const fabricVariants = db.fabricVariants.filter((v) => {
    const p = db.fabricProducts.find((x) => x.id === v.productId);
    return p?.kind !== 'lining';
  });
  const [productId, setProductId] = useState<string>(
    () =>
      db.fabricVariants.find((v) => v.id === existing?.fabricVariantId)?.productId ??
      fabricProducts[0]?.id ??
      '',
  );
  const liningVariants = db.fabricVariants.filter((v) => {
    const p = db.fabricProducts.find((x) => x.id === v.productId);
    return p?.kind === 'lining';
  });

  const widthCm = parseFloat(width || '0');
  const heightCm = parseFloat(height || '0');
  const showCost = role === 'admin';

  /**
   * سعر المتر لكل بديل بطانة، محسوبًا بمحرك التسعير نفسه.
   *
   * إلغاء البطانة لا يحذف بندًا بل يغيّر فئة التسعير كلها، و100% تزيد على
   * المتر. فبدل أن يُقال ذلك كلامًا يُعرض رقمه على الخيار لحظة النظر إليه -
   * فلا يُكتشف فرق السعر في الإجمالي بعد الحفظ.
   */
  const unitPriceFor = useCallback(
    (lining: FabricVariant | null): number | null => {
      if (!fabricVariantId || !(heightCm > 0) || heightCm > TALL_BAND_MAX_CM) return null;
      const variant = db.fabricVariants.find((v) => v.id === fabricVariantId) ?? null;
      const product = db.fabricProducts.find((p) => p.id === variant?.productId) ?? null;
      return priceWindow({
        window: {
          id: 'probe', organizationId: db.organization.id, projectId, roomId, name,
          widthCm: widthCm > 0 ? widthCm : 100, heightCm,
          hasLining: !!lining, track, fullness: FULLNESS,
          fabricVariantId, liningVariantId: lining?.id ?? null,
          quantity: 1, notes: '', measuredAt: null, measuredBy: null,
        },
        product,
        variant,
        liningVariant: lining,
        rules: db.pricingRules,
        settings: db.settings,
      }).unitPriceAgorot;
    },
    [db, fabricVariantId, heightCm, widthCm, track, projectId, roomId, name],
  );

  const preview = useMemo(() => {
    if (!(widthCm > 0) || !(heightCm > 0)) return null;
    // بلا قماش يسقط أكبر بند تكلفة، فيظهر إجمالي أقلّ من الحقيقة وهامش أعلى
    // منها. القماش إلزامي أصلًا، فالانتظار حتى اختياره أصدق من رقم مؤقّت.
    if (!fabricVariantId) return null;
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
        hasLining,
        track,
        fullness: FULLNESS,
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
    hasLining,
    track,
    notes,
  ]);

  // رحلة الحفظ الحية طويلة (RPC ثم جلب اللقطة): الحارس يمنع شباكًا توأمًا
  const [saving, setSaving] = useState<boolean>(false);

  const save = async () => {
    if (saving) return false;
    setSaving(true);
    setError(null);
    const res = await saveWindow({
      id: existing?.id,
      projectId,
      roomId,
      name,
      widthCm,
      heightCm,
      hasLining,
      track,
      fullness: FULLNESS,
      fabricVariantId,
      liningVariantId,
      quantity: 1,
      notes,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (await save()) goBack();
  };

  /**
   * الإدخال المتتابع (M2): الحفظ يبقيك في المحرر جاهزًا للشباك التالي.
   *
   * ما يتكرر في شبابيك الغرفة الواحدة يُحمَل (المسار والقماش
   * والبطانة) لأن غرفةً تُفصَّل غالبًا بلغة واحدة، وما يخصّ كل
   * شباك وحده يُصفَّر (المقاسات، الملاحظات، الاسم يتقدّم للترتيب التالي).
   * هكذا تُدخَل خمسة شبابيك بخمسة قياسات لا بخمسة نماذج كاملة.
   */
  const submitAndNext = async () => {
    const saved = name;
    if (!(await save())) return;
    setName(nextWindowName(roomCount + 1));
    setWidth('');
    setHeight('');
    setNotes('');
    setSavedFlash(`حُفظ «${saved}» - أدخل قياسات التالي.`);
    // النموذج الجديد أعلى الصفحة، فيُمرَّر إليه بعد الحفظ لا يُترك المستخدم أمام الأزرار
    scroller.current?.scrollToTop();
  };

  return (
    <ScrollScreen ref={scroller}>
      <Card>
        <AppText variant="heading">القياس</AppText>
        <View style={{ marginTop: spacing.md, gap: spacing.md }}>
          <Field label="اسم الشباك" value={name} onChangeText={setName} placeholder="الشباك الأول" />
          {/* الاسم الترتيبي مكتوب سلفًا؛ يبقى «الرئيسي» بديلًا بلمسة لمن
              يسمّي شباك الصدارة به */}
          {!existing && name !== 'الشباك الرئيسي' && (
            <Row gap={spacing.sm} wrap>
              <Pressable onPress={() => setName('الشباك الرئيسي')} style={suggestChip}>
                <AppText variant="caption" color={palette.oliveDark}>
                  الشباك الرئيسي
                </AppText>
              </Pressable>
            </Row>
          )}
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
                label={resolveBand(heightCm) === 'standard' ? 'شريحة أقل من 320 سم' : 'شريحة 320 سم فأكثر'}
                bg={resolveBand(heightCm) === 'standard' ? palette.sageSoft : palette.terracottaSoft}
                fg={resolveBand(heightCm) === 'standard' ? palette.oliveDark : palette.terracotta}
                small
              />
            </Row>
          )}
        </View>
      </Card>

      <Card>
        <AppText variant="heading">المسار</AppText>
        <View style={{ marginTop: spacing.md }}>
          {/* خياران اثنان: الشريط المقسوم أسرع من رقاقات متناثرة، ويُظهر
              البديل حاضرًا بدل أن يُطلب البحث عنه */}
          <SegmentedControl
            value={track}
            onChange={setTrack}
            options={(Object.keys(TRACK_LABELS) as TrackType[]).map((t) => ({
              value: t,
              label: TRACK_LABELS[t],
            }))}
          />
        </View>
      </Card>

      <Card>
        {/* لم يعد اختياريًا: عليه يقوم السعر والحجز التلقائي بعد الاعتماد.
            يُقال هنا قبل الحفظ لا في رسالة خطأ بعده. */}
        <SectionHeader
          title="القماش"
          subtitle={fabricVariantId ? 'النوع ثم اللون' : 'مطلوب - عليه يقوم السعر والحجز'}
        />
        {/* النوع أولًا ثم ألوانه: سردُ كل الألوان معًا يُخفي أنها صنفان،
            وتطول القائمة كلما دخل لونٌ جديد على المكتبة. */}
        <SegmentedControl
          value={productId}
          onChange={(id) => {
            setProductId(id);
            // تبديل النوع يُلغي اللون: ألوان الأول لا وجود لها في الثاني،
            // وحمل لونٍ سابقًا إلى نوعٍ جديد يعني قماشًا لا يملكه المحل
            setFabricVariantId(null);
          }}
          options={fabricProducts.map((p) => ({ value: p.id, label: p.name }))}
        />
        <Row gap={spacing.sm} wrap style={{ marginTop: spacing.md }}>
          {fabricVariants
            .filter((v) => v.productId === productId)
            .map((v) => {
              const active = fabricVariantId === v.id;
              return (
                <Pressable
                  key={v.id}
                  accessibilityRole="radio"
                  aria-checked={active}
                  onPress={() => setFabricVariantId(v.id)}
                  style={[swatchCard, active && { borderColor: palette.olive, backgroundColor: palette.sageSoft }]}
                >
                  <Swatch color={v.colorHex} size={40} />
                  <AppText variant="label">{v.colorName}</AppText>
                  {active && <Check size={16} color={palette.olive} />}
                </Pressable>
              );
            })}
        </Row>

        <Divider />
        {/* سؤالٌ واحد بثلاثة أجوبة، لا مفتاح «مع/بدون» ثم قائمة درجاتٍ تظهر
            بعده. البطانة عند المالك ثلاث حالات لا اثنتان، وتقسيمها على
            بطاقتين كان يُخفي الدرجة عمّن اختار «بدون» ثم عاد.
            وتحت كل حالة ما يفرّقها فعلًا: كم تستهلك، وبكم تُحاسب. */}
        <AppText variant="label">البطانة</AppText>
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {[null, ...liningVariants].map((v) => {
            const active = v ? hasLining && liningVariantId === v.id : !hasLining;
            const extra = v?.customerSurchargePerMeterAgorot ?? 0;
            const unit = unitPriceFor(v);
            return (
              <Pressable
                key={v?.id ?? 'none'}
                role="radio"
                // تُمرَّر صريحةً: `accessibilityState.checked` لا تصل إلى
                // `aria-checked` على الويب هنا - فحصتُها في المتصفح فوجدتها
                // فارغة، فيصير الصفّ زرَّ اختيارٍ لا يُعرف أيّه مختار
                aria-checked={active}
                onPress={() => {
                  setHasLining(!!v);
                  if (v) setLiningVariantId(v.id);
                }}
                style={[optionRow, active && optionRowActive]}
              >
                <View style={[radio, active && radioActive]}>
                  {active && <Check size={13} color={palette.white} />}
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="label">
                    {v ? `بطانة ${v.colorName.replace('تغطية ', '')}` : 'بدون بطانة'}
                  </AppText>
                  <AppText variant="caption" color={palette.muted}>
                    {v
                      ? `${meters(v.metersPerRunningMeter)} لكل متر طولي` +
                        (extra > 0 ? ` • +${money(extra)} على سعر المتر` : ' • ضمن سعر المتر')
                      : 'ستارة بطبقة واحدة'}
                  </AppText>
                </View>
                {unit != null && (
                  <View style={{ alignItems: 'flex-start' }}>
                    <AppText variant="label" color={active ? palette.oliveDark : palette.charcoal}>
                      {money(unit)}
                    </AppText>
                    <AppText variant="caption" color={palette.muted}>
                      للمتر
                    </AppText>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </Card>

      {!preview && widthCm > 0 && heightCm > 0 && !fabricVariantId && (
        <Card>
          <Row gap={spacing.sm}>
            <Calculator size={18} color={palette.muted} />
            <AppText variant="caption" color={palette.muted}>
              اختر القماش ليظهر السعر - سعر بلا قماش ناقص.
            </AppText>
          </Row>
        </Card>
      )}

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
            <PreviewRow label="الأمتار" value={meters(preview.runningMeters)} />
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
      {!!savedFlash && <Banner tone="success" title={savedFlash} />}

      {existing ? (
        <Button
          label="حفظ التعديلات"
          loading={saving}
          full
          icon={<Save size={18} color={palette.ivory} />}
          onPress={submit}
        />
      ) : (
        <>
          {/* الإدخال المتتابع هو الحالة الغالبة (غرفة = عدة شبابيك)،
              فزرّه هو الأساسي والإغلاق يليه */}
          <Button
            label="حفظ وإضافة التالي"
          loading={saving}
            full
            icon={<Plus size={18} color={palette.ivory} />}
            onPress={submitAndNext}
          />
          <Button
            label="حفظ وإغلاق"
          loading={saving}
            variant="secondary"
            full
            icon={<Save size={17} color={palette.oliveDark} />}
            onPress={submit}
          />
        </>
      )}

      {!!existing && (
        <Button
          label="حذف الشباك"
          variant="ghost"
          full
          icon={<Trash2 size={16} color={palette.danger} />}
          onPress={() => setConfirmDelete(true)}
        />
      )}
      {!!existing && (
        <ConfirmSheet
          visible={confirmDelete}
          title="حذف الشباك"
          body="سيتم حذف القياس نهائيًا من المشروع."
          confirmLabel="حذف"
          tone="danger"
          loading={deleting}
          icon={<Trash2 size={22} color={palette.danger} />}
          onConfirm={async () => {
            setDeleting(true);
            const res = await deleteWindow(existing.id);
            setDeleting(false);
            setConfirmDelete(false);
            if (!res.ok) {
              setDeleteError(res.error);
              return;
            }
            goBack();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      {!!deleteError && (
        <Banner
          tone="danger"
          title="تعذر الحذف"
          body={deleteError}
          action={<Button label="حسنًا" variant="ghost" small onPress={() => setDeleteError(null)} />}
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

/**
 * صفُّ اختيارٍ كامل العرض بدل رقاقة ضيّقة: القرار له ثلاثة بدائل لكلٍّ منها
 * سطرُ شرحٍ ورقمُ سعر، ولا يتّسع لذلك عرضُ ثلثِ شاشة.
 */
const optionRow = {
  // اصطلاح التطبيق للصفوف: يبدأ الصفّ من اليمين حيث تبدأ القراءة
  flexDirection: RTL_ROW,
  alignItems: 'center' as const,
  gap: spacing.md,
  minHeight: 56,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: palette.line,
  backgroundColor: palette.white,
};
const optionRowActive = {
  borderColor: palette.olive,
  backgroundColor: palette.sageSoft,
};
const radio = {
  width: 22,
  height: 22,
  borderRadius: 11,
  borderWidth: 1.5,
  borderColor: palette.line,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
const radioActive = { backgroundColor: palette.olive, borderColor: palette.olive };

const suggestChip = {
  paddingHorizontal: spacing.md,
  height: 36,
  justifyContent: 'center' as const,
  borderRadius: radius.pill,
  borderWidth: 1,
  borderColor: palette.line,
  backgroundColor: palette.sand,
};
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
