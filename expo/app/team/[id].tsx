/**
 * ملف الموظف.
 *
 * ثلاثة أسئلة يسألها الأدمن عن أي موظف، وبهذا الترتيب: ماذا بين يديه الآن،
 * وكيف كان أداؤه، وماذا فعل مؤخرًا. الشاشة مرتّبة على هذا الترتيب لا على
 * ترتيب الجداول في القاعدة.
 *
 * والمؤشرات تُقرأ من الدور: الخياط يُقاس بالتسليم والهدر، والعامل الميداني
 * بالزيارات، والمبيعات بالعروض والتحصيل. لا يُعرض لدورٍ مؤشرٌ لا أساس له في
 * بياناته.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Banknote, CalendarClock, ChevronLeft, Package, PackagePlus, Phone, Scissors, ShieldCheck, UserX } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import {
  AppText,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  Divider,
  EmptyState,
  Field,
  Pill,
  Row,
  ScrollScreen,
  SectionHeader,
} from '@/components/ui';
import { gradients, palette, radius, spacing } from '@/constants/theme';
import { availabilityTone } from '@/domain/inventory';
import { can, ROLE_LABELS } from '@/domain/permissions';
import { staffDossier, tailorFabricOverview, type StaffMetric } from '@/domain/staff';
import { fieldAccruals, staffBalance, tailorAccruals } from '@/domain/staffLedger';
import { formatDate, formatDateTime, meters, money, phone as fmtPhone } from '@/lib/format';
import { useStore } from '@/providers/store';

export default function StaffDossierScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, role, setProfileActive } = useStore();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const profile = db.profiles.find((p) => p.id === id);
  const dossier = useMemo(
    () => (profile ? staffDossier(db, profile.id, Date.now()) : null),
    [db, profile],
  );
  const activity = useMemo(
    () =>
      db.auditLogs
        .filter((l) => l.actorId === id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8),
    [db.auditLogs, id],
  );

  if (!profile || !dossier) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<UserX size={26} color={palette.olive} />}
          title="الحساب غير موجود"
          body="ربما حُذف أو ليس ضمن صلاحياتك."
        />
      </ScrollScreen>
    );
  }

  const isAdmin = can(role, 'manage_users');

  return (
    <ScrollScreen>
      <Card padded={false} style={{ overflow: 'hidden' }}>
        <LinearGradient
          colors={gradients.heroDeep as unknown as [string, string]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: spacing.lg }}
        >
          <Row gap={spacing.md} align="center">
            <Avatar id={profile.id} name={profile.fullName} size={62} onDark />
            <View style={{ flex: 1, gap: 3 }}>
              <AppText variant="title" color={palette.ivory} numberOfLines={1}>
                {profile.fullName}
              </AppText>
              <AppText variant="caption" color={palette.sage}>
                {profile.title}
              </AppText>
              <Row gap={6}>
                <Phone size={13} color={palette.sage} />
                <AppText variant="caption" color={palette.sage}>
                  {fmtPhone(profile.phone)}
                </AppText>
              </Row>
            </View>
            <View style={{ gap: 6, alignItems: 'flex-end' }}>
              <Pill
                label={ROLE_LABELS[profile.role]}
                bg="rgba(255,255,255,0.16)"
                fg={palette.ivory}
                small
              />
              {!profile.isActive && (
                <Pill label="معطّل" bg={palette.dangerSoft} fg={palette.danger} small />
              )}
            </View>
          </Row>
        </LinearGradient>
      </Card>

      {!profile.isActive && (
        <Banner
          tone="warning"
          title="هذا الحساب معطّل"
          body="لا يظهر في قوائم الإسناد ولا يستطيع الدخول، وسجلّه محفوظ كما هو."
        />
      )}

      <Card>
        <SectionHeader
          title="بين يديه الآن"
          subtitle={dossier.open.length === 0 ? 'لا شيء معلّق' : `${dossier.open.length} مهمة`}
        />
        {dossier.open.length === 0 ? (
          <Row gap={spacing.sm}>
            <ShieldCheck size={16} color={palette.success} />
            <AppText variant="caption" color={palette.muted}>
              أنهى كل ما أُسند إليه.
            </AppText>
          </Row>
        ) : (
          dossier.open.map((t, i) => (
            <View key={t.id}>
              {i > 0 && <Divider />}
              <Pressable
                onPress={() => router.push({ pathname: '/project/[id]', params: { id: t.projectId } })}
                style={({ pressed }) => [
                  { borderRadius: radius.sm, paddingVertical: spacing.sm },
                  pressed && { backgroundColor: palette.ivoryDeep },
                ]}
              >
                <Row justify="space-between" align="flex-start">
                  <View style={{ flex: 1 }}>
                    <AppText variant="label" numberOfLines={1}>
                      {t.title}
                    </AppText>
                    <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                      {t.hint}
                    </AppText>
                    {!!t.dueAt && (
                      <Row gap={5} style={{ marginTop: 3 }}>
                        <CalendarClock size={12} color={t.overdue ? palette.danger : palette.muted} />
                        <AppText variant="caption" color={t.overdue ? palette.danger : palette.muted}>
                          {t.overdue ? 'تأخّر - ' : ''}
                          {formatDate(t.dueAt)}
                        </AppText>
                      </Row>
                    )}
                  </View>
                  <ChevronLeft size={16} color={palette.muted} />
                </Row>
              </Pressable>
            </View>
          ))
        )}
      </Card>

      <Card>
        <SectionHeader title="الأداء" subtitle="الشهر الجاري وما قبله" />
        <Row gap={spacing.sm} wrap>
          {dossier.metrics.map((m) => (
            <MetricTile key={m.label} metric={m} />
          ))}
        </Row>
      </Card>

      {profile.role === 'tailor' && <TailorFabricCard profileId={profile.id} />}

      {(profile.role === 'tailor' || profile.role === 'field') && (
        <StaffFinanceCard profileId={profile.id} role={profile.role} isAdmin={isAdmin} />
      )}

      <Card>
        <SectionHeader
          title="آخر ما فعل"
          subtitle={
            dossier.lastActiveAt ? `آخر نشاط ${formatDateTime(dossier.lastActiveAt)}` : 'لا نشاط بعد'
          }
        />
        {activity.length === 0 && (
          <AppText variant="caption" color={palette.muted}>
            لم يُسجَّل له أثر في سجل التدقيق بعد.
          </AppText>
        )}
        {activity.map((l, i) => (
          <View key={l.id}>
            {i > 0 && <Divider />}
            <Row justify="space-between" align="flex-start" gap={spacing.md}>
              <AppText variant="caption" style={{ flex: 1 }}>
                {l.summary}
              </AppText>
              <AppText variant="caption" color={palette.muted}>
                {formatDateTime(l.createdAt)}
              </AppText>
            </Row>
          </View>
        ))}
      </Card>

      {isAdmin && (
        <Card onPress={() => setConfirm(true)}>
          <Row gap={spacing.md}>
            <UserX size={18} color={profile.isActive ? palette.danger : palette.success} />
            <View style={{ flex: 1 }}>
              <AppText variant="label" color={profile.isActive ? palette.danger : palette.success}>
                {profile.isActive ? 'تعطيل الحساب' : 'إعادة تفعيل الحساب'}
              </AppText>
              <AppText variant="caption" color={palette.muted}>
                {profile.isActive
                  ? 'يخرج من قوائم الإسناد ويبقى سجلّه كاملًا'
                  : 'يعود للظهور في قوائم الإسناد'}
              </AppText>
            </View>
          </Row>
        </Card>
      )}

      {!!statusError && (
        <Banner tone="danger" title="تعذر تغيير حالة الحساب" body={statusError} />
      )}

      <ConfirmSheet
        visible={confirm}
        icon={<UserX size={24} color={profile.isActive ? palette.danger : palette.success} />}
        title={profile.isActive ? 'تعطيل هذا الحساب؟' : 'إعادة تفعيل الحساب؟'}
        body={
          profile.isActive
            ? 'لن يستطيع الدخول ولن يظهر في قوائم الإسناد. المشاريع والحركات المسجّلة باسمه تبقى كما هي.'
            : 'سيعود الحساب للعمل ويظهر في قوائم الإسناد من جديد.'
        }
        confirmLabel={profile.isActive ? 'نعم، عطّل' : 'نعم، فعّل'}
        onConfirm={() => {
          // النتيجة تُقرأ: المتجر يرفض التعطيل في الوضع الحي بصدق، وابتلاعُ
          // الرفض كان يُغلق اللوحة كأن الحساب عُطّل وهو ما زال يدخل
          const res = setProfileActive(profile.id, !profile.isActive);
          setConfirm(false);
          if (!res.ok) setStatusError(res.error);
        }}
        onCancel={() => setConfirm(false)}
      />
    </ScrollScreen>
  );
}

/**
 * قماش الخياط - متابعة الأدمن (قرار المالك 11.8.2026).
 *
 * الخياط يضيف بضاعته بنفسه والأدمن يتابع لا يوافق، فالمطلوب صورةٌ تُقرأ
 * في ثوانٍ على هرم الصحافة المقلوب: أربعة أرقام بهيكلٍ واحد (تسمية ثم
 * قيمة ثم سياقها الزمني)، ثم شريط تحركاتٍ لآخر ثمانية أحداث لمن أراد
 * التفصيل - لا جداول ولا أعمدة.
 */
function TailorFabricCard({ profileId }: { profileId: string }) {
  const { db } = useStore();
  const fabric = useMemo(() => tailorFabricOverview(db, profileId), [db, profileId]);
  const holdingLevel = availabilityTone(fabric.holdingM);

  return (
    <Card>
      <SectionHeader title="القماش" subtitle="عنده الآن، وتحركاته - يضيف بنفسه وأنت تتابع" />
      <Row gap={spacing.sm} wrap>
        <MetricTile
          metric={{
            label: 'متر عنده الآن',
            value: meters(fabric.holdingM, false),
            alarming: holdingLevel === 'danger',
          }}
        />
        <MetricTile
          metric={{ label: 'أضاف آخر 30 يومًا', value: meters(fabric.received30M, false) }}
        />
        <MetricTile
          metric={{ label: 'استهلك آخر 30 يومًا', value: meters(fabric.consumed30M, false) }}
        />
        <MetricTile
          metric={{
            label: 'زيادات عن المخطط - 90 يومًا',
            value: `${fabric.overruns90}`,
            alarming: fabric.overruns90 > 0,
          }}
        />
      </Row>

      {fabric.events.length > 0 && (
        <View style={{ marginTop: spacing.md }}>
          <AppText variant="label" color={palette.muted}>
            آخر التحركات
          </AppText>
          {fabric.events.map((e) => (
            <Row key={e.id} justify="space-between" align="flex-start" gap={spacing.md} style={{ paddingVertical: spacing.sm }}>
              <Row gap={spacing.sm} style={{ flex: 1 }} align="flex-start">
                {e.kind === 'receipt' ? (
                  <PackagePlus size={15} color={palette.olive} style={{ marginTop: 4 }} />
                ) : (
                  <Scissors size={15} color={e.overM > 0 ? palette.danger : palette.muted} style={{ marginTop: 4 }} />
                )}
                <View style={{ flex: 1 }}>
                  <AppText variant="caption">
                    {e.title} • {meters(e.meters)}
                    {e.overM > 0 ? ` (+${meters(e.overM)} عن المخطط)` : ''}
                  </AppText>
                  <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                    {e.detail}
                  </AppText>
                </View>
              </Row>
              <AppText variant="caption" color={palette.muted}>
                {formatDate(e.at)}
              </AppText>
            </Row>
          ))}
        </View>
      )}
      {fabric.events.length === 0 && (
        <Row gap={spacing.sm} style={{ marginTop: spacing.sm }}>
          <Package size={15} color={palette.muted} />
          <AppText variant="caption" color={palette.muted}>
            لا تحركات قماشٍ مسجَّلة له بعد.
          </AppText>
        </Row>
      )}
    </Card>
  );
}

/**
 * حساب الموظف (M8/M14/M15/M26).
 *
 * الرصيد جارٍ لا شهري: مستحقٌّ منذ البداية ناقص مدفوع منذ البداية.
 * السالب سلفة لصالح المعرض ويُقال بلسانه لا برقم سالب صامت. الاستحقاقات
 * مشتقة من الورشات/الزيارات فلا تفترق عن مصدرها، والدفعات وحدها تُقيَّد.
 */
function StaffFinanceCard({
  profileId,
  role,
  isAdmin,
}: {
  profileId: string;
  role: 'tailor' | 'field';
  isAdmin: boolean;
}) {
  const { db, busy, recordStaffPayout } = useStore();
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const balance = useMemo(() => staffBalance(db, profileId, role), [db, profileId, role]);
  const accruals = useMemo(
    () => (role === 'tailor' ? tailorAccruals(db, profileId) : []),
    [db, profileId, role],
  );
  const fieldItems = useMemo(
    () => (role === 'field' ? fieldAccruals(db, profileId) : []),
    [db, profileId, role],
  );
  const payouts = db.staffLedger.filter((e) => e.staffId === profileId).slice(0, 6);
  const negative = balance.balanceAgorot < 0;

  const pay = async () => {
    setError(null);
    setInfo(null);
    const res = await recordStaffPayout(
      profileId,
      Math.round(parseFloat(amount || '0')) * 100,
      note,
    );
    if (!res.ok) return setError(res.error);
    setAmount('');
    setNote('');
    setInfo('سُجّلت الدفعة ووصل الإشعار للموظف.');
  };

  return (
    <Card>
      <SectionHeader
        title="الحساب"
        subtitle={role === 'tailor' ? 'رصيد جارٍ - لا يعرف الشهر' : 'أجرة الزيارات الميدانية'}
      />
      <Row gap={spacing.sm} wrap>
        <MetricTile
          metric={{
            label: role === 'tailor' ? `مستحق عن ${balance.itemsCount} ورشة` : `مستحق عن ${balance.itemsCount} زيارة`,
            value: money(balance.accruedAgorot),
          }}
        />
        <MetricTile metric={{ label: 'دُفع له', value: money(balance.paidAgorot) }} />
      </Row>
      <View
        style={{
          marginTop: spacing.sm,
          borderRadius: radius.md,
          padding: spacing.md,
          backgroundColor: negative ? palette.warningSoft : palette.sageSoft,
        }}
      >
        <AppText variant="numberLarge">
          {money(Math.abs(balance.balanceAgorot))}
        </AppText>
        <AppText variant="caption" color={palette.muted}>
          {negative ? 'سلفة لصالح المعرض - دُفع له مقدَّمًا' : 'الرصيد المستحق له الآن'}
        </AppText>
      </View>

      {role === 'tailor' && accruals.length > 0 && (
        <View style={{ marginTop: spacing.md }}>
          <AppText variant="label" color={palette.muted}>
            مستحقّه عن كل ورشة
          </AppText>
          {accruals.slice(0, 6).map((a) => {
            const project = db.projects.find((p) => p.id === a.projectId);
            return (
              <Pressable
                key={a.assignmentId}
                onPress={() => router.push({ pathname: '/project/[id]', params: { id: a.projectId } })}
                style={({ pressed }) => [
                  { paddingVertical: spacing.sm, borderRadius: radius.sm },
                  pressed && { backgroundColor: palette.ivoryDeep },
                ]}
              >
                <Row justify="space-between" gap={spacing.md}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" numberOfLines={1}>
                      {project?.title ?? 'مشروع'}
                    </AppText>
                    <AppText variant="caption" color={palette.muted}>
                      {formatDate(a.completedAt)} • {a.metersM} متر
                    </AppText>
                  </View>
                  <AppText variant="label">{money(a.feeAgorot)}</AppText>
                </Row>
              </Pressable>
            );
          })}
        </View>
      )}

      {role === 'field' && fieldItems.length > 0 && (
        <AppText variant="caption" color={palette.muted} style={{ marginTop: spacing.sm }}>
          {fieldItems.length} زيارة مكتملة × {money(db.settings.fieldVisitWageAgorot)} للزيارة
        </AppText>
      )}

      {payouts.length > 0 && (
        <View style={{ marginTop: spacing.md }}>
          <AppText variant="label" color={palette.muted}>
            آخر الدفعات
          </AppText>
          {payouts.map((e) => (
            <Row key={e.id} justify="space-between" style={{ paddingVertical: 4 }}>
              <AppText variant="caption" color={palette.muted}>
                {formatDate(e.createdAt)}
                {e.note ? ` • ${e.note}` : ''}
              </AppText>
              <AppText variant="caption">{money(e.amountAgorot)}</AppText>
            </Row>
          ))}
        </View>
      )}

      {isAdmin && (
        <View style={{ marginTop: spacing.md, gap: spacing.md }}>
          <Divider />
          <Row gap={spacing.md} align="flex-end">
            <View style={{ flex: 1 }}>
              <Field
                label="دفعة له الآن"
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/\D/g, ''))}
                keyboardType="numeric"
                suffix="₪"
                placeholder="0"
              />
            </View>
            <Button
              label="سجّل الدفعة"
              small
              loading={busy === 'payout'}
              disabled={!(parseInt(amount || '0', 10) > 0)}
              icon={<Banknote size={15} color={palette.ivory} />}
              onPress={pay}
            />
          </Row>
          <Field label="ملاحظة" value={note} onChangeText={setNote} placeholder="مثال: سلفة، تصفية ورشات تموز" />
          {!!error && <Banner tone="danger" title="تعذر التسجيل" body={error} />}
          {!!info && <Banner tone="success" title={info} />}
        </View>
      )}
    </Card>
  );
}

/** بلاطة رقم - اللون يتدخّل حين يستحق الرقم تدخّلًا فقط. */
function MetricTile({ metric }: { metric: StaffMetric }) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: '46%',
        borderRadius: radius.md,
        padding: spacing.md,
        backgroundColor: metric.alarming ? palette.dangerSoft : palette.ivoryDeep,
      }}
    >
      <AppText variant="number" color={metric.alarming ? palette.danger : palette.charcoal}>
        {metric.value}
      </AppText>
      <AppText variant="caption" color={palette.muted}>
        {metric.label}
      </AppText>
    </View>
  );
}
