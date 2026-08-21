/**
 * نموذج التنقّل - **مصدرٌ واحد** يستهلكه شريط التبويبات السفليّ على الهاتف
 * والشريط الجانبي على سطح المكتب.
 *
 * لِمَ رُفع من `(tabs)/_layout.tsx`: `expo-router` يحوّل `href: null` إلى
 * `tabBarItemStyle:{display:'none'}` **ويجرّد `href` من الخيارات**، فلا يستطيع
 * أيّ شريطٍ مخصَّص أن يستردّ حراسة الأدوار من واصفات الملاحة. ولو نُسخت
 * الشروط في الشريطين لانحرف أحدهما عن الآخر بصمتٍ عند أوّل تعديل - وهو
 * بالضبط ما تمنعه قاعدة «تعديلٌ واحد يظهر في الاثنين».
 */
import {
  BadgePercent,
  Bell,
  CalendarCheck,
  FileText,
  Home,
  Layers,
  LayoutGrid,
  MoreHorizontal,
  RefreshCcw,
  ScrollText,
  Scissors,
  Settings,
  Tags,
  Users,
  Wallet,
} from 'lucide-react-native';
import React from 'react';

import { palette } from '@/constants/theme';
import { can } from '@/domain/permissions';
import { unreadCount } from '@/hooks/selectors';
import type { Database } from '@/data/seed';
import type { Role, UUID } from '@/types/domain';
import { type TabName } from '@/domain/navigation';

export * from '@/domain/navigation';

export function tabIcon(name: TabName, color: string, size = 22): React.ReactNode {
  switch (name) {
    case 'home':
      return <Home size={size} color={color} />;
    case 'projects':
      return <LayoutGrid size={size} color={color} />;
    case 'visits':
      return <CalendarCheck size={size} color={color} />;
    case 'tasks':
      return <Scissors size={size} color={color} />;
    case 'mystock':
      return <Layers size={size} color={color} />;
    case 'customers':
      return <Users size={size} color={color} />;
    case 'inventory':
      return <Layers size={size} color={color} />;
    case 'more':
      return <MoreHorizontal size={size} color={color} />;
  }
}


/* ─────────────────────── الوجهات الثانوية (شاشة المزيد) ─────────────────── */

export interface LinkItem {
  label: string;
  hint: string;
  icon: React.ReactNode;
  href: string;
  badge?: number;
  show: boolean;
}

/**
 * روابط الإدارة - كانت مضمَّنةً في `more.tsx` وحدها، فرُفعت ليعرضها الشريط
 * الجانبي أيضًا على سطح المكتب بحراسة `can(role, …)` نفسها بلا نسخ.
 */
export function secondaryLinks(db: Database, role: Role, userId?: UUID): LinkItem[] {
  const pendingOps = db.operations.filter((o) => o.state !== 'synced').length;
  const pendingDiscounts = db.discountRequests.filter((d) => d.status === 'pending').length;
  return [
    {
      label: 'الإشعارات',
      hint: 'كل ما يخصك من تنبيهات',
      icon: <Bell size={20} color={palette.olive} />,
      href: '/notifications',
      badge: unreadCount(db, userId),
      show: true,
    },
    {
      label: 'الدفعات والتحصيل',
      hint: 'كل الدفعات وحالة التحصيل',
      icon: <Wallet size={20} color={palette.olive} />,
      href: '/payments',
      show: can(role, 'record_payment'),
    },
    {
      label: 'طلبات الخصم',
      hint: 'الموافقات الاستثنائية',
      icon: <BadgePercent size={20} color={palette.olive} />,
      href: '/discounts',
      badge: pendingDiscounts,
      show: can(role, 'approve_discount'),
    },
    {
      label: 'التقارير',
      hint: 'الأداء والربحية والمخزون',
      icon: <FileText size={20} color={palette.olive} />,
      href: '/reports',
      show: can(role, 'view_reports'),
    },
    {
      label: 'قواعد التسعير',
      hint: 'الأسعار حسب الارتفاع والنوع',
      icon: <Tags size={20} color={palette.olive} />,
      href: '/pricing-rules',
      show: can(role, 'edit_pricing_rules'),
    },
    {
      label: 'مركز المزامنة',
      hint: 'العمليات المحفوظة على الجهاز',
      icon: <RefreshCcw size={20} color={palette.olive} />,
      href: '/sync',
      badge: pendingOps,
      show: true,
    },
    {
      label: 'الطاقم',
      hint: 'الحسابات، الأداء، ما بين يد كل واحد',
      icon: <Users size={20} color={palette.olive} />,
      href: '/team',
      show: can(role, 'manage_users'),
    },
    {
      label: 'سجل التدقيق',
      hint: 'من فعل ماذا ومتى',
      icon: <ScrollText size={20} color={palette.olive} />,
      href: '/audit',
      show: role === 'admin',
    },
    {
      label: 'الإعدادات والصلاحيات',
      hint: 'المعرض، الأدوار والصلاحيات',
      icon: <Settings size={20} color={palette.olive} />,
      href: '/settings',
      show: true,
    },
  ];
}
