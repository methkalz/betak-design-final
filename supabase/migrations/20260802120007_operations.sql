-- ============================================================================
-- بيتك ديزاين — 0007 — الخياط والزيارات والدفعات والمرفقات
-- المرجع: workflows.html (الخياط، التركيب والإغلاق)، mobile.html (الصور)
-- ============================================================================

-- ── تعيينات الخياط ──────────────────────────────────────────────────────────
create table core.tailor_assignments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations (id) on delete cascade,
  project_id      uuid not null,
  tailor_id       uuid not null,
  stage           core.tailor_stage not null default 'received',
  instructions    text not null default '',
  due_date        timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,

  -- سجل انتقال المراحل: [{"stage":"cutting","at":"2026-..."}]
  stage_history   jsonb not null default '[]'::jsonb
    check (jsonb_typeof(stage_history) = 'array'),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- مشروع واحد لا يسند لخياطين في آن واحد
  unique (organization_id, project_id),
  unique (organization_id, id),
  foreign key (organization_id, project_id)
    references core.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, tailor_id)
    references core.organization_members (organization_id, user_id) on delete restrict
);

comment on table core.tailor_assignments is
  'الخياط يرى المشاريع المسندة إليه فقط — سياسة RLS تعتمد على tailor_id.';

-- ── الزيارات الميدانية ──────────────────────────────────────────────────────
create table core.field_visits (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations (id) on delete cascade,
  project_id      uuid not null,
  assignee_id     uuid not null,
  type            core.visit_type not null,
  status          core.visit_status not null default 'scheduled',
  scheduled_at    timestamptz not null,
  started_at      timestamptz,
  completed_at    timestamptz,
  notes           text not null default '',

  -- قائمة تحقق التركيب (workflows.html)
  check_track       boolean not null default false,
  check_curtain     boolean not null default false,
  check_height      boolean not null default false,
  check_cleanliness boolean not null default false,

  customer_signed_off boolean not null default false,
  created_at      timestamptz not null default now(),

  constraint completed_visits_have_timestamp check (
    status <> 'completed' or completed_at is not null
  ),

  unique (organization_id, id),
  foreign key (organization_id, project_id)
    references core.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, assignee_id)
    references core.organization_members (organization_id, user_id) on delete restrict
);

comment on table core.field_visits is
  'العامل الميداني يرى زياراته فقط — سياسة RLS تعتمد على assignee_id.';

-- ── الدفعات ─────────────────────────────────────────────────────────────────
-- لا حذف لدفعة. التصحيح بقيد عكسي دائم يحمل مبلغا سالبا ويشير للأصل.
create table core.payments (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references core.organizations (id) on delete cascade,
  project_id          uuid not null,
  amount_agorot       bigint not null check (amount_agorot <> 0),
  kind                core.payment_kind not null,
  method              core.payment_method not null,
  reference           text not null default '',
  note                text not null default '',
  reversed_payment_id uuid,
  created_by          uuid not null,
  created_at          timestamptz not null default now(),

  -- القيد العكسي وحده يحمل مبلغا سالبا، وهو وحده يشير إلى دفعة أصلية
  constraint reversal_shape check (
    (kind = 'reversal' and amount_agorot < 0 and reversed_payment_id is not null)
    or (kind <> 'reversal' and amount_agorot > 0 and reversed_payment_id is null)
  ),
  -- سبب العكس إلزامي
  constraint reversal_needs_note check (
    kind <> 'reversal' or length(btrim(note)) > 0
  ),
  -- لا يعكس القيد العكسي مرتين
  unique (organization_id, reversed_payment_id),

  unique (organization_id, id),
  foreign key (organization_id, project_id)
    references core.projects (organization_id, id) on delete restrict,
  foreign key (organization_id, reversed_payment_id)
    references core.payments (organization_id, id) on delete restrict,
  foreign key (organization_id, created_by)
    references core.organization_members (organization_id, user_id) on delete restrict
);

comment on table core.payments is
  'جدول مالي. لا UPDATE ولا DELETE — الرصيد = Σ amount_agorot بما فيه العكسيات.';
comment on constraint reversal_shape on core.payments is
  'يمنع دفعة عادية بمبلغ سالب، ويمنع قيدا عكسيا يتيما بلا أصل.';

-- ── المرفقات ────────────────────────────────────────────────────────────────
create table core.attachments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations (id) on delete cascade,
  project_id      uuid not null,
  room_id         uuid,
  window_id       uuid,
  visit_id        uuid,
  kind            core.attachment_kind not null,

  -- مسار داخل bucket خاص، يبدأ دائما بـ organization_id
  storage_path    text not null check (length(btrim(storage_path)) > 0),
  caption         text not null default '',
  byte_size       bigint check (byte_size >= 0),
  created_by      uuid not null,
  created_at      timestamptz not null default now(),

  unique (organization_id, storage_path),
  unique (organization_id, id),
  foreign key (organization_id, project_id)
    references core.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, room_id)
    references core.rooms (organization_id, id)
    on delete set null (room_id),
  foreign key (organization_id, window_id)
    references core.windows (organization_id, id)
    on delete set null (window_id),
  foreign key (organization_id, visit_id)
    references core.field_visits (organization_id, id)
    on delete set null (visit_id),
  foreign key (organization_id, created_by)
    references core.organization_members (organization_id, user_id) on delete restrict
);

comment on column core.attachments.storage_path is
  'المسار يبدأ بـ organization_id/ وتتحقق منه سياسات storage.objects.';
comment on table core.attachments is
  'الصف ينشأ بعد نجاح الرفع فقط. قبل ذلك الصورة في طابور الرفع على الجهاز.';
