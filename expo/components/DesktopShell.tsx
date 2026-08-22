/**
 * قوقعة سطح المكتب - شريطٌ جانبيّ دائم بجانب محتوى الشاشة.
 *
 * **لماذا في الجذر لا في `(tabs)`**: شريط التبويبات يعيش داخل مجموعة
 * `(tabs)` وحدها، فلو حوّلناه إلى شريطٍ جانبي (`tabBarPosition`) لاختفى
 * التنقّل على الـ٣٣ شاشة الأخرى - مشروع، مقترح سعر، إعدادات… وقائمةٌ جانبية
 * تختفي حين تفتح مشروعًا أسوأ من لا قائمة. فتُركَّب هنا حول الملاحة كلّها.
 *
 * على الهاتف يعيد **شَظِيّة**: لا عنصرَ زائدًا في الشجرة، فالنتيجة مطابقةٌ
 * حرفيًّا لما كان قبل حزمة الويب.
 */
import { usePathname, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LogOut } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { PoweredBy } from '@/components/PoweredBy';
import { AppText, ConfirmSheet, Divider, Pill, Row, RTL_ROW } from '@/components/ui';
import { layout, palette, radius, shadow, spacing, TOUCH } from '@/constants/theme';
import { ROLE_LABELS } from '@/domain/permissions';
import { useIsDesktop } from '@/hooks/useResponsive';
import {
  activeDestination,
  secondaryLinks,
  TAB_ORDER,
  TAB_TITLES,
  tabDestinations,
  tabIcon,
} from '@/lib/navModel';
import { useStore } from '@/providers/store';

export function DesktopShell({ children }: { children: React.ReactNode }) {
  const isDesktop = useIsDesktop();
  const { currentUser, hydrated } = useStore();
  const pathname = usePathname();

  // بلا قوقعة: على الهاتف، وقبل الترطيب، ولمن لم يدخل بعد - لا شريط تنقّل
  // لمن لا وجهةَ له. وشاشتا البداية والدخول تملآن الشاشة وحدهما.
  const bare =
    !isDesktop || !hydrated || !currentUser || pathname === '/login' || pathname === '/';
  if (bare) return <>{children}</>;

  return (
    // ‏row-reverse كعُرف الشجرة كلّها: أوّل ابنٍ يُرسم أقصى اليمين - وهي جهة
    // بدء القراءة بالعربية. المستند نفسه يبقى LTR، فلا نلمس dir ولا I18nManager.
    <View style={styles.shell}>
      <Sidebar pathname={pathname} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

function Sidebar({ pathname }: { pathname: string }) {
  const { db, role, currentUser, signOut } = useStore();
  const router = useRouter();
  const [confirmOut, setConfirmOut] = useState(false);

  const dest = tabDestinations(role);
  const active = activeDestination(pathname);
  const links = secondaryLinks(db, role, currentUser?.id).filter((l) => l.show);

  return (
    <View style={styles.sidebar}>
      {/* خامة الشريط: وصفة زجاج iOS نفسها - وهي هوية التطبيق التي كانت
          غائبةً عن الويب، تُسدَّد هنا على السطح الوحيد الدائم الظهور. */}
      <BlurView intensity={44} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.sidebarTint} />

      <Pressable onPress={() => router.push('/home')} style={styles.brand}>
        <AppText variant="heading">بيتك ديزاين</AppText>
        <AppText variant="caption" color={palette.muted} numberOfLines={1}>
          {db.organization.name}
        </AppText>
      </Pressable>

      <Divider style={{ marginVertical: spacing.sm }} />

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        {TAB_ORDER.map((name) => {
          const href = dest[name];
          if (!href) return null;
          const on = active === href;
          return (
            <SidebarItem
              key={name}
              label={TAB_TITLES[name]}
              icon={tabIcon(name, on ? palette.oliveDark : palette.muted, 20)}
              active={on}
              onPress={() => router.push(href as never)}
            />
          );
        })}

        <Divider style={{ marginVertical: spacing.sm }} />

        {links.map((l) => (
          <SidebarItem
            key={l.href}
            label={l.label}
            icon={l.icon}
            badge={l.badge}
            active={pathname.startsWith(l.href)}
            onPress={() => router.push(l.href as never)}
          />
        ))}
      </ScrollView>

      <Divider style={{ marginVertical: spacing.sm }} />

      <Pressable onPress={() => router.push('/more')} style={styles.user}>
        <Row gap={spacing.sm}>
          <Avatar id={currentUser?.id ?? 'anon'} name={currentUser?.fullName ?? ''} size={36} />
          <View style={{ flex: 1 }}>
            <AppText variant="label" numberOfLines={1}>
              {currentUser?.fullName}
            </AppText>
            <AppText variant="caption" color={palette.muted}>
              {ROLE_LABELS[role]}
            </AppText>
          </View>
        </Row>
      </Pressable>

      {/* الخروج على الهاتف مدفونٌ تحت «المزيد» - وهو تنازلٌ فرضته مساحة
          الشاشة. على المكتب مكانه القوقعة. */}
      <SidebarItem
        label="تسجيل الخروج"
        icon={<LogOut size={20} color={palette.danger} />}
        danger
        onPress={() => setConfirmOut(true)}
      />

      {/* قدم القوقعة: السطح الوحيد الدائم على المكتب، فالتوقيع هنا يظهر على
          كلّ شاشةٍ بلا أن يُقحَم في تخطيط أيٍّ منها. */}
      <PoweredBy />

      <ConfirmSheet
        visible={confirmOut}
        title="تسجيل الخروج"
        body="ستحتاج إلى رقم هاتفك وكلمة السر للدخول مجددًا."
        confirmLabel="خروج"
        tone="danger"
        icon={<LogOut size={22} color={palette.danger} />}
        onConfirm={() => {
          setConfirmOut(false);
          signOut();
          router.replace('/login');
        }}
        onCancel={() => setConfirmOut(false)}
      />
    </View>
  );
}

function SidebarItem({
  label,
  icon,
  active,
  badge,
  danger,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  badge?: number;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      // ‏react-native-web يمرّر hovered مع pressed؛ أنواع RN لا تعرفها بعد،
      // وهي undefined أصليًّا فيسقط العنصر من المصفوفة بلا أثر.
      style={(s) => {
        const st = s as { pressed: boolean; hovered?: boolean };
        return [
          styles.item,
          (st.hovered || st.pressed) && (danger ? styles.itemDanger : styles.itemHover),
          active && styles.itemActive,
        ];
      }}
    >
      {active && <View style={styles.activeEdge} />}
      <Row gap={spacing.md}>
        {icon}
        <AppText
          variant="label"
          color={danger ? palette.danger : active ? palette.oliveDark : palette.charcoal}
          numberOfLines={1}
          style={{ flex: 1 }}
        >
          {label}
        </AppText>
        {!!badge && badge > 0 && (
          <Pill label={`${badge}`} bg={palette.terracottaSoft} fg={palette.terracotta} small />
        )}
      </Row>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    flexDirection: RTL_ROW,
    backgroundColor: palette.ivory,
  },
  sidebar: {
    width: layout.sidebar,
    paddingHorizontal: spacing.md,
    paddingTop: layout.gutter,
    paddingBottom: spacing.lg,
    // الحدّ على اليسار الفيزيائي = الحافّة الداخلية في تخطيطٍ يبدأ من اليمين
    borderLeftWidth: 1,
    borderLeftColor: palette.line,
    ...shadow.card,
  },
  sidebarTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  brand: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    gap: 2,
  },
  item: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    marginBottom: 2,
  },
  itemHover: { backgroundColor: 'rgba(79,70,229,0.06)' },
  itemDanger: { backgroundColor: palette.dangerSoft },
  itemActive: { backgroundColor: palette.sageSoft },
  activeEdge: {
    position: 'absolute',
    right: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: palette.olive,
  },
  user: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
});
