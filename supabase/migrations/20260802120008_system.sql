-- ============================================================================
-- بيتك ديزاين — 0008 — الإشعارات والتدقيق وسجل عمليات العميل
-- المرجع: mobile.html (Push, Deep Links)، architecture.html (المزامنة)
-- ============================================================================

-- ── الإشعارات ───────────────────────────────────────────────────────────────
create table core.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations (id) on delete cascade,
  user_id         uuid not null,
  kind            core.notification_kind not null,
  title           text not null check (length(btrim(title)) > 0),
  body            text not null default '',

  -- baytakdesign://projects/{id} … (mobile.html)
  deep_link       text,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),

  unique (organization_id, id),
  foreign key (organization_id, user_id)
    references core.organization_members (organization_id, user_id) on delete cascade
);

comment on table core.notifications is
  'إشعار لمستخدم بعينه. سياسة RLS: يرى المستخدم صفوفه هو فقط.';

-- ── سجل التدقيق ─────────────────────────────────────────────────────────────
-- يكتب من داخل الـRPCs فقط. للعملاء قراءة، ولا كتابة ولا تعديل ولا حذف.
create table core.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations (id) on delete cascade,
  actor_id        uuid,
  action          text not null check (length(btrim(action)) > 0),
  entity          text not null,
  entity_id       text not null default '',
  summary         text not null default '',

  -- لقطة اختيارية للقيم قبل/بعد للعمليات المالية والمخزنية
  payload         jsonb,
  created_at      timestamptz not null default now(),

  unique (organization_id, id),
  foreign key (organization_id, actor_id)
    references core.organization_members (organization_id, user_id)
    on delete set null (actor_id)
);

comment on column core.audit_logs.actor_id is
  'يسمح بأن يكون null: العملية قد تنفذ من نظام أو مهمة مجدولة لا من مستخدم.';
comment on table core.audit_logs is
  'غير قابل للتعديل. أي عملية مال أو مخزون أو خصم أو حالة رسمية تكتب صفا هنا.';

-- ── سجل عمليات العميل (طرف الخادم من طابور المزامنة) ────────────────────────
-- الجهاز يولد client_operation_id و idempotency_key قبل الإرسال. هذا الجدول
-- يتذكر ما نفذ فعلا، فتصير إعادة الإرسال بعد انقطاع الشبكة بلا أثر مزدوج.
create table core.client_operations (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references core.organizations (id) on delete cascade,
  user_id             uuid not null,
  client_operation_id uuid not null,
  idempotency_key     uuid not null,
  kind                text not null check (length(btrim(kind)) > 0),
  entity_id           text not null default '',
  state               core.sync_state not null default 'pending',
  attempts            integer not null default 0 check (attempts >= 0),
  error               text,

  -- نتيجة التنفيذ الأول، تعاد كما هي عند أي إعادة إرسال لاحقة
  result              jsonb,
  created_at          timestamptz not null default now(),
  synced_at           timestamptz,

  unique (organization_id, client_operation_id),
  unique (organization_id, idempotency_key),
  unique (organization_id, id),
  foreign key (organization_id, user_id)
    references core.organization_members (organization_id, user_id) on delete cascade
);

comment on table core.client_operations is
  'دفتر الـidempotency. يقرأ في مستهل كل RPC حساس قبل تنفيذ أي أثر جانبي.';
comment on column core.client_operations.result is
  'يعاد حرفيا عند تكرار نفس idempotency_key بدل إعادة تنفيذ العملية.';
