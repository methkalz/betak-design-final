/**
 * منطق التنقّل - نقيٌّ بلا أيقونات ولا JSX، فيُفحَص بـbun:test مباشرةً.
 *
 * **مصدرٌ واحد** يستهلكه شريط التبويبات السفليّ على الهاتف والشريط الجانبي
 * على سطح المكتب. لِمَ رُفع من `(tabs)/_layout.tsx`: `expo-router` يحوّل
 * `href: null` إلى `tabBarItemStyle:{display:'none'}` **ويجرّد `href` من
 * الخيارات**، فلا يستطيع شريطٌ مخصَّص أن يستردّ حراسة الأدوار من واصفات
 * الملاحة. ولو نُسخت الشروط في الشريطين لانحرف أحدهما بصمتٍ عند أوّل تعديل -
 * وهو بالضبط ما تمنعه قاعدة «تعديلٌ واحد يظهر في الاثنين».
 */
import type { Role } from '@/types/domain';

/* ─────────────────────────── التبويبات الثمانية ─────────────────────────── */

export type TabName =
  | 'home'
  | 'projects'
  | 'visits'
  | 'tasks'
  | 'mystock'
  | 'customers'
  | 'inventory'
  | 'more';

/** ترتيب القراءة الطبيعي - من الرئيسية إلى المزيد. */
export const TAB_ORDER: readonly TabName[] = [
  'home',
  'projects',
  'visits',
  'tasks',
  'mystock',
  'customers',
  'inventory',
  'more',
] as const;

/** مسار كلّ تبويب - حرفيّ كي يقبله `typedRoutes` في expo-router. */
export type TabHref =
  | '/home'
  | '/projects'
  | '/visits'
  | '/tasks'
  | '/mystock'
  | '/customers'
  | '/inventory'
  | '/more';

export const TAB_TITLES: Record<TabName, string> = {
  home: 'الرئيسية',
  projects: 'المشاريع',
  visits: 'زياراتي',
  tasks: 'أوامر الإنتاج',
  mystock: 'بضاعتي',
  customers: 'الزبائن',
  inventory: 'المخزون',
  more: 'المزيد',
};

/**
 * وجهة كلّ تبويب لهذا الدور، أو `null` إن كان محجوبًا عنه.
 * الشروط منقولةٌ حرفًا بحرف عمّا كان في `(tabs)/_layout.tsx`.
 */
export function tabDestinations(role: Role): Record<TabName, TabHref | null> {
  const isAdmin = role === 'admin' || role === 'sales';
  const isField = role === 'field';
  const isTailor = role === 'tailor';
  return {
    home: '/home',
    projects: isTailor ? null : '/projects',
    visits: isField ? '/visits' : null,
    tasks: isTailor ? '/tasks' : null,
    mystock: isTailor ? '/mystock' : null,
    customers: isAdmin ? '/customers' : null,
    inventory: isAdmin ? '/inventory' : null,
    more: '/more',
  };
}

/**
 * المسارات التي «يملكها» كلّ تبويب - فيبقى الشريط يقول أين أنت وأنت ثلاث
 * شاشاتٍ عميقًا داخل مشروع. الأطول أوّلًا عند المطابقة.
 */
export const TAB_OWNS: Record<string, readonly string[]> = {
  '/home': ['/home'],
  '/projects': ['/projects', '/project', '/quotation', '/window', '/reserve'],
  '/customers': ['/customers', '/customer'],
  '/inventory': ['/inventory', '/fabric', '/roll', '/stock', '/consumption'],
  '/visits': ['/visits', '/visit'],
  '/tasks': ['/tasks', '/tailor'],
  '/mystock': ['/mystock'],
  '/more': [
    '/more',
    '/team',
    '/settings',
    '/reports',
    '/payments',
    '/discounts',
    '/notifications',
    '/sync',
    '/audit',
    '/pricing-rules',
  ],
};

/** أيّ وجهةٍ تُضاء للمسار الحالي - أطول بادئةٍ مطابقة تفوز. */
export function activeDestination(pathname: string): string | null {
  let best: string | null = null;
  let bestLen = 0;
  for (const [dest, owned] of Object.entries(TAB_OWNS)) {
    for (const prefix of owned) {
      if ((pathname === prefix || pathname.startsWith(prefix + '/')) && prefix.length > bestLen) {
        best = dest;
        bestLen = prefix.length;
      }
    }
  }
  return best;
}
