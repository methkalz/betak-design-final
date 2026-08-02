-- ============================================================================
-- بيتك ديزاين — 0002 — الهوية والمؤسسة والإعدادات
-- المرجع: database.html (الجداول الأساسية)، security.html، roles.html
-- ============================================================================

-- ── المؤسسات ────────────────────────────────────────────────────────────────
create table core.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null check (length(btrim(name)) > 0),
  phone       text        not null default '',
  address     text        not null default '',
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

comment on table core.organizations is
  'المستأجر (tenant). كل بيانات العمل معلقة على هذا الجدول.';

-- ── الحسابات ────────────────────────────────────────────────────────────────
-- ملاحظة تصميمية: النموذج الأولي في types/domain.ts يضع organization_id و role
-- و pin داخل Profile. هنا نتبع الدليل: العضوية والدور ينتقلان إلى
-- organization_members (يسمحان بتعدد المؤسسات ويغذيان private.is_org_member)،
-- و pin يحذف نهائيا — المصادقة صارت Supabase Auth لا رقما سريا في جدول.
create table core.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text        not null check (length(btrim(full_name)) > 0),
  phone      text        not null default '',
  title      text        not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table core.profiles is
  'بيانات المستخدم العامة. المفتاح هو auth.users.id — لا كلمات سر ولا PIN هنا.';

-- ── عضوية المؤسسة والدور ────────────────────────────────────────────────────
create table core.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations (id) on delete cascade,
  user_id         uuid not null references core.profiles (id) on delete cascade,
  role            core.app_role not null,
  is_active       boolean     not null default true,
  joined_at       timestamptz not null default now(),

  unique (organization_id, user_id),
  unique (organization_id, id)
);

comment on table core.organization_members is
  'مصدر الحقيقة للصلاحيات. private.is_org_member و private.has_role يقرآن من هنا.';

-- ── إعدادات العمل ───────────────────────────────────────────────────────────
-- صف واحد لكل مؤسسة. هذه القيم تغذي محرك التسعير مباشرة
-- (قارن domain/pricing.ts → BusinessSettings).
create table core.business_settings (
  organization_id uuid primary key
    references core.organizations (id) on delete cascade,

  -- تكاليف داخلية لكل متر ركض، بالأغورة
  track_cost_per_meter_agorot          bigint not null default 1000
    check (track_cost_per_meter_agorot >= 0),
  delivery_cost_per_meter_agorot       bigint not null default 1000
    check (delivery_cost_per_meter_agorot >= 0),
  measure_install_cost_per_meter_agorot bigint not null default 3000
    check (measure_install_cost_per_meter_agorot >= 0),
  lining_cost_per_meter_agorot         bigint not null default 900
    check (lining_cost_per_meter_agorot >= 0),

  -- حدود تجارية
  min_margin_percent             numeric(5,2) not null default 35
    check (min_margin_percent between 0 and 100),
  employee_discount_limit_percent numeric(5,2) not null default 5
    check (employee_discount_limit_percent between 0 and 100),
  admin_discount_limit_percent   numeric(5,2) not null default 10
    check (admin_discount_limit_percent between 0 and 100),
  quotation_validity_days        integer not null default 14
    check (quotation_validity_days > 0),
  vat_percent                    numeric(5,2) not null default 18
    check (vat_percent between 0 and 100),
  currency                       char(3) not null default 'ILS',

  updated_at timestamptz not null default now(),

  -- حد الموظف لا يمكن أن يتجاوز حد الأدمن — قيد يمنع إعدادا متناقضا
  constraint discount_limits_ordered
    check (employee_discount_limit_percent <= admin_discount_limit_percent)
);

comment on column core.business_settings.vat_percent is
  'نسبة ض.ق.م. مصدر الحقيقة الوحيد — لا تكرر على core.organizations.';

-- ── أجهزة المستخدمين (Push) ─────────────────────────────────────────────────
create table core.user_devices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations (id) on delete cascade,
  user_id         uuid not null references core.profiles (id) on delete cascade,
  expo_push_token text not null check (length(btrim(expo_push_token)) > 0),
  platform        text not null check (platform in ('ios', 'android', 'web')),
  last_seen_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),

  unique (user_id, expo_push_token),
  unique (organization_id, id),
  foreign key (organization_id, user_id)
    references core.organization_members (organization_id, user_id) on delete cascade
);

comment on table core.user_devices is
  'رموز Expo Push. الربط المركب يضمن أن الجهاز مسجل ضمن المؤسسة نفسها.';
