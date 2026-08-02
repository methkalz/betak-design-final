import { useRouter } from 'expo-router';
import { CalendarClock, ChevronLeft, MapPin, Phone } from 'lucide-react-native';
import React from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Pill, ProgressBar, Row, Swatch } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import {
  PROJECT_STATUS_LABELS,
  TAILOR_STAGE_LABELS,
  VISIT_TYPE_LABELS,
  projectStatusColor,
  statusProgress,
} from '@/domain/labels';
import { projectFinance } from '@/hooks/selectors';
import { formatDate, formatTime, isSameDay, money } from '@/lib/format';
import { useStore } from '@/providers/store';

export function StatTile({
  icon,
  label,
  value,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <View style={[styles.tile, { backgroundColor: tint }]}>
      <View style={styles.tileIcon}>{icon}</View>
      <AppText variant="numberLarge">{value}</AppText>
      <AppText variant="caption" color={palette.muted}>
        {label}
      </AppText>
    </View>
  );
}

export function ProjectRow({ projectId }: { projectId: string }) {
  const { db, role } = useStore();
  const router = useRouter();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) return null;
  const customer = db.customers.find((c) => c.id === project.customerId);
  const finance = projectFinance(db, project.id);
  const c = projectStatusColor(project.status);
  const showMoney = role === 'admin' || role === 'sales';

  return (
    <Card onPress={() => router.push(`/project/${project.id}`)}>
      <Row justify="space-between" align="flex-start">
        <View style={{ flex: 1, gap: 4 }}>
          <Row gap={spacing.sm}>
            <AppText variant="heading">{customer?.fullName ?? ''}</AppText>
            {project.priority === 'high' && (
              <Pill label="عاجل" bg={palette.dangerSoft} fg={palette.danger} small />
            )}
          </Row>
          <AppText variant="caption" color={palette.muted}>
            {project.code} • {project.title}
          </AppText>
        </View>
        <Pill label={PROJECT_STATUS_LABELS[project.status]} bg={c.bg} fg={c.fg} />
      </Row>

      <View style={{ marginTop: spacing.md, gap: 6 }}>
        <ProgressBar value={statusProgress(project.status)} color={c.fg} />
        <Row justify="space-between">
          <AppText variant="caption" color={palette.muted}>
            {db.windows.filter((w) => w.projectId === project.id).length} شباك •{' '}
            {db.rooms.filter((r) => r.projectId === project.id).length} غرفة
          </AppText>
          {showMoney && finance.totalAgorot > 0 && (
            <AppText variant="caption" color={palette.muted}>
              {money(finance.paidAgorot)} / {money(finance.totalAgorot)}
            </AppText>
          )}
        </Row>
      </View>
    </Card>
  );
}

export function VisitCard({ visitId }: { visitId: string }) {
  const { db } = useStore();
  const router = useRouter();
  const visit = db.fieldVisits.find((v) => v.id === visitId);
  if (!visit) return null;
  const project = db.projects.find((p) => p.id === visit.projectId);
  const customer = db.customers.find((c) => c.id === project?.customerId);
  const isToday = isSameDay(visit.scheduledAt, new Date());

  const call = () => {
    if (Platform.OS === 'web' || !customer) return;
    Linking.openURL(`tel:${customer.phone.replace(/-/g, '')}`).catch(() => {});
  };
  const maps = () => {
    const q = encodeURIComponent(`${customer?.address ?? ''} ${customer?.city ?? ''}`);
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${q}`,
      default: `https://www.google.com/maps/search/?api=1&query=${q}`,
    });
    Linking.openURL(url).catch(() => {});
  };

  return (
    <Card>
      <Pressable onPress={() => router.push(`/visit/${visit.id}`)}>
        <Row justify="space-between" align="flex-start">
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="heading">{customer?.fullName}</AppText>
            <AppText variant="caption" color={palette.muted}>
              {project?.title}
            </AppText>
          </View>
          <Pill
            label={VISIT_TYPE_LABELS[visit.type]}
            bg={visit.type === 'measurement' ? palette.infoSoft : palette.sageSoft}
            fg={visit.type === 'measurement' ? palette.info : palette.olive}
          />
        </Row>
        <Row gap={spacing.lg} style={{ marginTop: spacing.md }}>
          <Row gap={5}>
            <CalendarClock size={15} color={palette.muted} />
            <AppText variant="caption" color={palette.muted}>
              {isToday ? formatTime(visit.scheduledAt) : formatDate(visit.scheduledAt)}
            </AppText>
          </Row>
          <Row gap={5}>
            <MapPin size={15} color={palette.muted} />
            <AppText variant="caption" color={palette.muted}>
              {customer?.city}
            </AppText>
          </Row>
        </Row>
      </Pressable>
      <Row gap={spacing.sm} style={{ marginTop: spacing.lg }}>
        <Button
          label={visit.status === 'in_progress' ? 'متابعة الزيارة' : 'فتح الزيارة'}
          onPress={() => router.push(`/visit/${visit.id}`)}
          style={{ flex: 1 }}
        />
        <Button
          label="اتصال"
          variant="secondary"
          icon={<Phone size={16} color={palette.oliveDark} />}
          onPress={call}
        />
        <Button
          label="خرائط"
          variant="secondary"
          icon={<MapPin size={16} color={palette.oliveDark} />}
          onPress={maps}
        />
      </Row>
    </Card>
  );
}

export function TailorCard({ assignmentId }: { assignmentId: string }) {
  const { db } = useStore();
  const router = useRouter();
  const a = db.tailorAssignments.find((x) => x.id === assignmentId);
  if (!a) return null;
  const project = db.projects.find((p) => p.id === a.projectId);
  const customer = db.customers.find((c) => c.id === project?.customerId);
  const windows = db.windows.filter((w) => w.projectId === a.projectId);
  const reservations = db.reservations.filter(
    (r) => r.projectId === a.projectId && r.status !== 'released',
  );

  return (
    <Card onPress={() => router.push(`/tailor/${a.id}`)}>
      <Row justify="space-between" align="flex-start">
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{project?.title}</AppText>
          <AppText variant="caption" color={palette.muted}>
            {customer?.fullName} • {windows.length} قطعة
          </AppText>
        </View>
        <Pill
          label={TAILOR_STAGE_LABELS[a.stage]}
          bg={a.stage === 'ready' ? palette.successSoft : palette.terracottaSoft}
          fg={a.stage === 'ready' ? palette.success : palette.terracotta}
        />
      </Row>
      <Row gap={spacing.sm} wrap style={{ marginTop: spacing.md }}>
        {reservations.map((r) => {
          const roll = db.fabricRolls.find((x) => x.id === r.rollId);
          const variant = db.fabricVariants.find((v) => v.id === roll?.variantId);
          return (
            <Row key={r.id} gap={6} style={styles.rollChip}>
              <Swatch color={variant?.colorHex ?? palette.sand} size={18} />
              <AppText variant="caption">
                {roll?.code} • {r.quantityM} م
              </AppText>
            </Row>
          );
        })}
      </Row>
      <Row justify="space-between" style={{ marginTop: spacing.md }}>
        <AppText variant="caption" color={palette.muted}>
          الموعد النهائي: {formatDate(a.dueDate)}
        </AppText>
        <ChevronLeft size={16} color={palette.olive} />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 2,
    minHeight: 112,
    justifyContent: 'flex-end',
  },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  rollChip: {
    backgroundColor: palette.ivoryDeep,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
});
