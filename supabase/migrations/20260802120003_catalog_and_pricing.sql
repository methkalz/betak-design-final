-- ============================================================================
-- بيتك ديزاين — 0003 — مكتبة الأقمشة والرولات وقواعد التسعير
-- المرجع: inventory.html (الهيكل الصحيح)، pricing.html (جدولا الأسعار)
--
-- الفرق الجوهري الذي يشدد عليه الدليل:
--   Fabric Product  = وصف المنتج (كريب)
--   Fabric Variant  = اللون/التشكيلة (بيج دافئ) — وهنا تسكن تكلفة الجملة
--   Fabric Roll     = القطعة الفعلية في المستودع (CR-101)
-- ============================================================================

-- ── منتجات القماش ───────────────────────────────────────────────────────────
create table core.fabric_products (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations (id) on delete cascade,
  name            text not null check (length(btrim(name)) > 0),
  kind            core.fabric_kind not null,
  supplier        text not null default '',
  width_cm        numeric(10,2) not null check (width_cm > 0),
  composition     text not null default '',
  image_url       text,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),

  unique (organization_id, id)
);

comment on column core.fabric_products.kind is
  'يحدد فئة التسعير: crepe مقابل other. lining يعامل كبطانة لا كقماش رئيسي.';

-- ── تشكيلات القماش (الألوان) ────────────────────────────────────────────────
create table core.fabric_variants (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations (id) on delete cascade,
  product_id      uuid not null,
  color_name      text not null check (length(btrim(color_name)) > 0),
  color_hex       text not null default '#CCCCCC'
    check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  sku             text not null,
  cost_per_meter_agorot bigint not null check (cost_per_meter_agorot >= 0),
  image_url       text,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),

  unique (organization_id, sku),
  unique (organization_id, id),
  foreign key (organization_id, product_id)
    references core.fabric_products (organization_id, id) on delete cascade
);

comment on column core.fabric_variants.cost_per_meter_agorot is
  'حساس: تكلفة الجملة. يمنع ظهوره في أي view للأدوار field أو tailor.';

-- ── الرولات الفعلية ─────────────────────────────────────────────────────────
create table core.fabric_rolls (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations (id) on delete cascade,
  variant_id      uuid not null,
  code            text not null check (length(btrim(code)) > 0),
  dye_lot         text not null default '',
  location        text not null default '',
  initial_meters  numeric(12,3) not null check (initial_meters >= 0),
  is_mini_roll    boolean not null default false,
  retired_at      timestamptz,
  created_at      timestamptz not null default now(),

  unique (organization_id, code),
  unique (organization_id, id),
  foreign key (organization_id, variant_id)
    references core.fabric_variants (organization_id, id) on delete restrict
);

comment on table core.fabric_rolls is
  'الرول قطعة مادية. لا يحمل عمود رصيد — الرصيد يشتق من core.stock_movements.';
comment on column core.fabric_rolls.initial_meters is
  'الطول عند الاستلام، للتوثيق فقط. الرصيد الحالي يحسب من سجل الحركة.';
comment on column core.fabric_rolls.dye_lot is
  'دفعة الصبغ. اختلافها بين رولين مشروع واحد يوجب تحذيرا للمستخدم.';

-- ── قواعد التسعير ───────────────────────────────────────────────────────────
-- ثمانية صفوف لكل مؤسسة: نطاقا ارتفاع × أربع فئات.
create table core.pricing_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations (id) on delete cascade,
  band            core.height_band not null,
  category        core.pricing_category not null,
  customer_price_per_meter_agorot bigint not null
    check (customer_price_per_meter_agorot >= 0),
  tailor_cost_per_meter_agorot    bigint not null
    check (tailor_cost_per_meter_agorot >= 0),
  updated_at      timestamptz not null default now(),

  unique (organization_id, band, category),
  unique (organization_id, id)
);

comment on table core.pricing_rules is
  'سعر الزبون وأجرة الخياط لكل متر ركض. قابل للتعديل من الأدمن وحده.';
comment on column core.pricing_rules.customer_price_per_meter_agorot is
  'بالأغورة. مثال: ₪290 = 29000.';
comment on column core.pricing_rules.tailor_cost_per_meter_agorot is
  'حساس: أجرة الخياط جزء من التكلفة الداخلية. لا تعرض لدور field.';
