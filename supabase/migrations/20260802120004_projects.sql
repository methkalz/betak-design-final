-- ============================================================================
-- بيتك ديزاين — 0004 — الزبائن والمشاريع والغرف والشبابيك
-- المرجع: product.html (دورة حياة المشروع)، workflows.html، database.html
-- ============================================================================

-- ── الزبائن ─────────────────────────────────────────────────────────────────
-- الدليل: لا حذف فعلي للزبائن — أرشفة فقط.
create table core.customers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations (id) on delete cascade,
  full_name       text not null check (length(btrim(full_name)) > 0),
  phone           text not null default '',
  city            text not null default '',
  address         text not null default '',
  notes           text not null default '',
  preferences     text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz,

  unique (organization_id, id)
);

comment on column core.customers.archived_at is
  'الأرشفة تحل محل الحذف. لا DELETE على هذا الجدول في أي RPC.';

-- ── حالات المشروع (جدول مرجعي) ──────────────────────────────────────────────
-- الدليل يستخدم projects.status_code لا enum — لأن الحالات لها ترتيب دورة حياة
-- وتسميات عربية تحتاجهما التقارير ولوحة الـpipeline.
-- بيانات مرجعية عامة: لا organization_id عليها.
create table core.project_statuses (
  status_code text primary key,
  label_ar    text    not null,
  sort_order  integer not null unique,
  is_terminal boolean not null default false
);

insert into core.project_statuses (status_code, label_ar, sort_order, is_terminal) values
  ('new_request',          'طلب جديد',        1,  false),
  ('awaiting_measurement', 'بانتظار القياس',  2,  false),
  ('measured',             'تم القياس',       3,  false),
  ('quotation',            'عرض السعر',       4,  false),
  ('customer_approved',    'موافقة الزبون',   5,  false),
  ('fabric_allocated',     'تخصيص القماش',    6,  false),
  ('with_tailor',          'مع الخياط',       7,  false),
  ('ready_for_install',    'جاهز للتركيب',    8,  false),
  ('installed',            'تم التركيب',      9,  false),
  ('completed',            'مكتمل',           10, true);

-- ── المشاريع ────────────────────────────────────────────────────────────────
create table core.projects (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references core.organizations (id) on delete cascade,
  customer_id      uuid not null,
  code             text not null check (length(btrim(code)) > 0),
  title            text not null default '',
  status_code      text not null default 'new_request'
    references core.project_statuses (status_code),
  priority         core.priority not null default 'normal',
  field_worker_id  uuid,
  tailor_id        uuid,
  measurement_date timestamptz,
  installation_date timestamptz,
  notes            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  archived_at      timestamptz,

  -- تفاؤلي: كل تحديث حساس يتحقق من lock_version قبل الكتابة
  lock_version     integer not null default 1 check (lock_version > 0),

  unique (organization_id, code),
  unique (organization_id, id),
  foreign key (organization_id, customer_id)
    references core.customers (organization_id, id) on delete restrict,
  -- قائمة الأعمدة بعد set null إلزامية: بدونها يحاول بوستجرس تصفير
  -- organization_id أيضا فيصطدم بقيد not null عند حذف العضو (يحتاج PG 15+).
  foreign key (organization_id, field_worker_id)
    references core.organization_members (organization_id, user_id)
    on delete set null (field_worker_id),
  foreign key (organization_id, tailor_id)
    references core.organization_members (organization_id, user_id)
    on delete set null (tailor_id)
);

comment on column core.projects.lock_version is
  'قفل تفاؤلي. يرفض RPC الكتابة إذا تغيرت النسخة — يمنع الكتابة فوق تعديل غيرك.';
comment on column core.projects.field_worker_id is
  'الربط المركب يضمن أن العامل المعين عضو في المؤسسة نفسها.';

-- ── الغرف ───────────────────────────────────────────────────────────────────
create table core.rooms (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations (id) on delete cascade,
  project_id      uuid not null,
  name            text not null check (length(btrim(name)) > 0),
  floor           text not null default '',
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),

  unique (organization_id, id),
  foreign key (organization_id, project_id)
    references core.projects (organization_id, id) on delete cascade
);

-- ── الشبابيك ────────────────────────────────────────────────────────────────
create table core.windows (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references core.organizations (id) on delete cascade,
  project_id        uuid not null,
  room_id           uuid not null,
  name              text not null check (length(btrim(name)) > 0),

  width_cm          numeric(10,2) not null check (width_cm > 0),
  height_cm         numeric(10,2) not null check (height_cm > 0),
  model             core.curtain_model not null default 'wave',
  has_lining        boolean not null default false,
  track             core.track_type not null default 'ceiling_rail',
  fullness          numeric(6,3) not null default 3 check (fullness > 0),
  quantity          integer not null default 1 check (quantity > 0),

  fabric_variant_id uuid,
  lining_variant_id uuid,
  notes             text not null default '',
  measured_at       timestamptz,
  measured_by       uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (organization_id, id),
  foreign key (organization_id, project_id)
    references core.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, room_id)
    references core.rooms (organization_id, id) on delete cascade,
  foreign key (organization_id, fabric_variant_id)
    references core.fabric_variants (organization_id, id)
    on delete set null (fabric_variant_id),
  foreign key (organization_id, lining_variant_id)
    references core.fabric_variants (organization_id, id)
    on delete set null (lining_variant_id),
  foreign key (organization_id, measured_by)
    references core.organization_members (organization_id, user_id)
    on delete set null (measured_by)
);

comment on column core.windows.fullness is
  'مضاعف الكرمشة. أمتار القماش = المتر الركض × fullness (domain/pricing.ts).';
comment on column core.windows.height_cm is
  'يحدد نطاق التسعير: أقل من 330 = standard، و330 فأكثر = tall. فوق 500 يحتاج تسعيرة خاصة.';
