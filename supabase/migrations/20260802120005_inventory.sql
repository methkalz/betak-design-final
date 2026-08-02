-- ============================================================================
-- بيتك ديزاين — 0005 — الحجز والحركة والاستهلاك
-- المرجع: inventory.html، database.html (مثال RPC للحجز)، security.html
--
-- المبدأ الحاكم: سجل الحركة هو مصدر الحقيقة.
-- لا يوجد عمود «رصيد» في أي مكان. الرصيد يحسب دائما من core.stock_movements
-- بنفس المعادلة المطبقة في domain/inventory.ts:
--     on_hand   = Σ(receipt, return, adjustment_in, transfer_in)
--               − Σ(consumption, damage, adjustment_out, transfer_out)
--     reserved  = Σ(reservation) − Σ(reservation_release) − Σ(consumption)
--     available = on_hand − reserved        ← لا يجوز أن يصير سالبا أبدا
-- ============================================================================

-- ── الحجوزات ────────────────────────────────────────────────────────────────
create table core.fabric_reservations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations (id) on delete cascade,
  project_id      uuid not null,
  roll_id         uuid not null,
  quantity_m      numeric(12,3) not null check (quantity_m > 0),
  consumed_m      numeric(12,3) not null default 0 check (consumed_m >= 0),
  status          core.reservation_status not null default 'active',
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  released_at     timestamptz,

  -- لا يمكن استهلاك أكثر مما حجز
  constraint consumed_within_reservation check (consumed_m <= quantity_m),

  unique (organization_id, id),
  foreign key (organization_id, project_id)
    references core.projects (organization_id, id) on delete restrict,
  foreign key (organization_id, roll_id)
    references core.fabric_rolls (organization_id, id) on delete restrict,
  foreign key (organization_id, created_by)
    references core.organization_members (organization_id, user_id) on delete restrict
);

comment on table core.fabric_reservations is
  'الحجز يمسك القماش دون إخراجه: available = on_hand − reserved.';

-- ── سجل الحركة ──────────────────────────────────────────────────────────────
create table core.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations (id) on delete cascade,
  roll_id         uuid not null,
  type            core.movement_type not null,

  -- الكمية موجبة دائما. الاتجاه يشتق من النوع، لا من الإشارة.
  quantity_m      numeric(12,3) not null check (quantity_m > 0),

  project_id      uuid,
  reservation_id  uuid,
  reason          text not null default '',
  created_by      uuid not null,
  created_at      timestamptz not null default now(),

  -- منع التكرار عند إعادة إرسال العملية بعد انقطاع الشبكة
  idempotency_key uuid not null,

  -- الدليل: أي هدر أو تلف أو تسوية يحتاج سببا صريحا
  constraint reason_required_for_exceptions check (
    type not in ('damage', 'adjustment_in', 'adjustment_out')
    or length(btrim(reason)) > 0
  ),

  -- الحجز وفك الحجز والاستهلاك لا معنى لها بلا حجز مرجعي
  constraint reservation_required check (
    type not in ('reservation', 'reservation_release', 'consumption')
    or reservation_id is not null
  ),

  unique (organization_id, idempotency_key),
  unique (organization_id, id),
  foreign key (organization_id, roll_id)
    references core.fabric_rolls (organization_id, id) on delete restrict,
  foreign key (organization_id, project_id)
    references core.projects (organization_id, id)
    on delete set null (project_id),
  foreign key (organization_id, reservation_id)
    references core.fabric_reservations (organization_id, id) on delete restrict,
  foreign key (organization_id, created_by)
    references core.organization_members (organization_id, user_id) on delete restrict
);

comment on table core.stock_movements is
  'دفتر أستاذ غير قابل للتعديل. لا UPDATE ولا DELETE — التصحيح بحركة معاكسة.';
comment on column core.stock_movements.idempotency_key is
  'يرسله العميل. المفتاح الفريد مع organization_id يجعل إعادة الإرسال بلا أثر.';
comment on column core.stock_movements.quantity_m is
  'موجبة دائما. لا تخزن كميات سالبة — النوع هو ما يحدد دخولا أم خروجا.';

-- ── الاستهلاك الفعلي مقابل المخطط ───────────────────────────────────────────
create table core.fabric_usage (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations (id) on delete cascade,
  project_id      uuid not null,
  reservation_id  uuid not null,
  roll_id         uuid not null,
  planned_m       numeric(12,3) not null check (planned_m >= 0),
  actual_m        numeric(12,3) not null check (actual_m >= 0),
  waste_m         numeric(12,3) not null default 0 check (waste_m >= 0),
  reason          text not null default '',
  created_by      uuid not null,
  created_at      timestamptz not null default now(),

  -- الدليل: عند تسجيل استهلاك أعلى من المخطط، السبب إلزامي
  constraint reason_required_when_over_plan check (
    actual_m <= planned_m or length(btrim(reason)) > 0
  ),
  constraint reason_required_for_waste check (
    waste_m = 0 or length(btrim(reason)) > 0
  ),

  unique (organization_id, id),
  foreign key (organization_id, project_id)
    references core.projects (organization_id, id) on delete restrict,
  foreign key (organization_id, reservation_id)
    references core.fabric_reservations (organization_id, id) on delete restrict,
  foreign key (organization_id, roll_id)
    references core.fabric_rolls (organization_id, id) on delete restrict,
  foreign key (organization_id, created_by)
    references core.organization_members (organization_id, user_id) on delete restrict
);

comment on table core.fabric_usage is
  'الفارق بين المخطط والفعلي. تجاوز الخطة يستوجب سببا ويولد إشعارا للأدمن.';
