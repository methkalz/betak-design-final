-- ============================================================================
-- بيتك ديزاين — 0006 — عروض السعر والنسخ والبنود والخصومات
-- المرجع: pricing.html (قواعد الخصم)، database.html (العروض المرسلة لا تعدل)
--
-- قاعدة ملزمة: نسخة العرض بعد الإرسال لقطة مجمدة (locked). أي تعديل
-- ينشئ نسخة جديدة برقم أعلى — ولا يمس النسخة القديمة إطلاقا.
-- ============================================================================

-- ── العروض ──────────────────────────────────────────────────────────────────
create table core.quotations (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references core.organizations (id) on delete cascade,
  project_id         uuid not null,
  number             text not null check (length(btrim(number)) > 0),
  status             core.quotation_status not null default 'draft',
  current_version_id uuid,   -- FK يضاف بعد إنشاء جدول النسخ
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (organization_id, number),
  unique (organization_id, id),
  foreign key (organization_id, project_id)
    references core.projects (organization_id, id) on delete restrict
);

-- ── نسخ العرض ───────────────────────────────────────────────────────────────
create table core.quotation_versions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations (id) on delete cascade,
  quotation_id    uuid not null,
  version_number  integer not null check (version_number > 0),
  status          core.quotation_status not null default 'draft',

  -- مبالغ بالأغورة
  subtotal_agorot      bigint not null default 0 check (subtotal_agorot >= 0),
  discount_percent     numeric(5,2) not null default 0
    check (discount_percent between 0 and 100),
  discount_agorot      bigint not null default 0 check (discount_agorot >= 0),
  vat_agorot           bigint not null default 0 check (vat_agorot >= 0),
  total_agorot         bigint not null default 0 check (total_agorot >= 0),
  internal_cost_agorot bigint not null default 0 check (internal_cost_agorot >= 0),
  margin_percent       numeric(6,2) not null default 0,

  valid_until  timestamptz not null,
  note         text not null default '',
  created_by   uuid not null,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  approved_at  timestamptz,

  -- تصير true عند الإرسال ولا تعود false أبدا
  locked boolean not null default false,

  constraint discount_within_subtotal check (discount_agorot <= subtotal_agorot),
  constraint sent_versions_are_locked check (sent_at is null or locked),

  unique (organization_id, quotation_id, version_number),
  unique (organization_id, id),
  foreign key (organization_id, quotation_id)
    references core.quotations (organization_id, id) on delete cascade,
  foreign key (organization_id, created_by)
    references core.organization_members (organization_id, user_id) on delete restrict
);

comment on column core.quotation_versions.internal_cost_agorot is
  'حساس: التكلفة الداخلية. تحذف من أي view لدور field أو tailor.';
comment on column core.quotation_versions.margin_percent is
  'حساس: هامش الربح. قد يكون سالبا عند البيع بخسارة — لذا بلا قيد >= 0.';
comment on column core.quotation_versions.locked is
  'العرض المرسل لقطة مجمدة. التعديل يعني نسخة جديدة، لا تحديثا.';

alter table core.quotations
  add constraint quotations_current_version_fk
  foreign key (organization_id, current_version_id)
  references core.quotation_versions (organization_id, id)
  on delete set null (current_version_id);

-- ── بنود العرض ──────────────────────────────────────────────────────────────
-- النموذج الأولي يضمّن البنود كـ JSON داخل النسخة. هنا تطبع كجدول حقيقي
-- كما يحدد الدليل — ليصير التقرير والتجميع ممكنين بـ SQL.
create table core.quotation_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations (id) on delete cascade,
  version_id      uuid not null,
  window_id       uuid,   -- قد يكون null لبند يدوي غير مرتبط بشباك

  -- لقطة نصية وقت الإصدار: تبقى صحيحة حتى لو أعيدت تسمية الغرفة لاحقا
  room_name       text not null default '',
  window_name     text not null default '',
  description     text not null default '',

  width_cm        numeric(10,2) not null check (width_cm > 0),
  height_cm       numeric(10,2) not null check (height_cm > 0),
  running_meters  numeric(12,3) not null check (running_meters >= 0),
  quantity        integer not null default 1 check (quantity > 0),
  category        core.pricing_category not null,
  band            core.height_band not null,

  unit_price_agorot    bigint not null check (unit_price_agorot >= 0),
  line_total_agorot    bigint not null check (line_total_agorot >= 0),
  internal_cost_agorot bigint not null check (internal_cost_agorot >= 0),

  fabric_meters   numeric(12,3) not null default 0 check (fabric_meters >= 0),
  lining_meters   numeric(12,3) not null default 0 check (lining_meters >= 0),
  sort_order      integer not null default 0,

  unique (organization_id, id),
  foreign key (organization_id, version_id)
    references core.quotation_versions (organization_id, id) on delete cascade,
  foreign key (organization_id, window_id)
    references core.windows (organization_id, id)
    on delete set null (window_id)
);

comment on table core.quotation_items is
  'بنود مجمدة. لا تعدل بعد قفل النسخة — تنسخ إلى النسخة التالية بقيم جديدة.';
comment on column core.quotation_items.internal_cost_agorot is
  'حساس: تكلفة البند الداخلية.';

-- ── طلبات الخصم ─────────────────────────────────────────────────────────────
-- حتى 5%: صلاحية الموظف. 5.01%–10%: موافقة الأدمن. أكثر من 10%: ممنوع.
create table core.discount_requests (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references core.organizations (id) on delete cascade,
  quotation_id      uuid not null,
  version_id        uuid not null,
  requested_percent numeric(5,2) not null
    check (requested_percent > 0 and requested_percent <= 100),
  reason            text not null check (length(btrim(reason)) > 0),
  status            core.discount_request_status not null default 'pending',
  requested_by      uuid not null,
  decided_by        uuid,
  decided_at        timestamptz,
  decision_note     text not null default '',
  created_at        timestamptz not null default now(),

  -- القرار يحتاج صاحب قرار ووقتا معا، أو لا شيء
  constraint decision_is_complete check (
    (status = 'pending' and decided_by is null and decided_at is null)
    or (status <> 'pending' and decided_by is not null and decided_at is not null)
  ),

  unique (organization_id, id),
  foreign key (organization_id, quotation_id)
    references core.quotations (organization_id, id) on delete cascade,
  foreign key (organization_id, version_id)
    references core.quotation_versions (organization_id, id) on delete cascade,
  foreign key (organization_id, requested_by)
    references core.organization_members (organization_id, user_id) on delete restrict,
  foreign key (organization_id, decided_by)
    references core.organization_members (organization_id, user_id) on delete restrict
);

comment on table core.discount_requests is
  'الحد الأعلى المسموح يقرأ من business_settings — لا يثبت في قيد جدول.';
