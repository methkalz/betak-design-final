-- ============================================================================
-- بيتك ديزاين — 0011 — سطح الـAPI
-- المرجع: security.html، وتوصيات PostgREST الرسمية بعدم عرض الجداول إطلاقا.
--
-- ثلاث قواعد تحكم كل view هنا:
--
-- 1) security_invoker = on  — إلزامية على PG 15+. بدونها ينفذ الview بصلاحيات
--    مالكه فيتجاوز RLS بالكامل. هذا أشهر مقتل في تصاميم Supabase.
--
-- 2) الأعمدة المالية غائبة من الviews الأساسية، لا مخفية ولا مصفّرة.
--    من يحتاجها يستعلم view ماليا منفصلا.
--
-- 3) كل view مالي يقيّد نفسه بشرط WHERE على الدور. السبب دقيق: RLS تحت
--    fabric_variants تسمح لكل الأعضاء بالقراءة (الميداني يحتاج رؤية القماش)،
--    فview مالي فوقها بلا شرط كان سيسرّب تكلفة الجملة للخياط.
-- ============================================================================

-- ── تصحيح: إلغاء صلاحيات مستوى العمود من الترحيل 0010 ───────────────────────
-- Supabase توصي صراحة بعدم استخدامها: تكسر SELECT * عبر PostgREST، ولا تميّز
-- بين مستخدم وآخر أصلا لأن الجميع يستعمل دور authenticated نفسه. والأخطر أنها
-- كانت ستُفشل أي view بـsecurity_invoker يقرأ عمود تكلفة — حتى للأدمن.
-- الحماية تنتقل بالكامل إلى اختيار أعمدة الview أدناه.
revoke select on core.business_settings from authenticated;
grant select on core.business_settings to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- الهوية
-- ════════════════════════════════════════════════════════════════════════════

create view api.me with (security_invoker = on) as
select
  p.id            as user_id,
  om.organization_id,
  p.full_name,
  p.phone,
  p.title,
  p.avatar_url,
  om.role,
  om.is_active
from core.profiles p
join core.organization_members om on om.user_id = p.id
where p.id = (select auth.uid())
  and om.is_active;

comment on view api.me is 'هوية المستخدم الحالي ودوره. أول نداء بعد تسجيل الدخول.';

create view api.team_members with (security_invoker = on) as
select
  om.organization_id,
  om.user_id,
  p.full_name,
  p.phone,
  p.title,
  p.avatar_url,
  om.role,
  om.is_active
from core.organization_members om
join core.profiles p on p.id = om.user_id;

create view api.organization with (security_invoker = on) as
select o.id as organization_id, o.name, o.phone, o.address
from core.organizations o
where o.archived_at is null;

-- إعدادات غير مالية: نسب وحدود يحتاجها التطبيق لكل الأدوار
create view api.business_settings with (security_invoker = on) as
select
  organization_id,
  min_margin_percent,
  employee_discount_limit_percent,
  admin_discount_limit_percent,
  quotation_validity_days,
  vat_percent,
  currency
from core.business_settings;

-- التكاليف الداخلية لكل متر ركض — للأدوار المالية وحدها
create view api.business_settings_costs with (security_invoker = on) as
select
  organization_id,
  track_cost_per_meter_agorot,
  delivery_cost_per_meter_agorot,
  measure_install_cost_per_meter_agorot,
  lining_cost_per_meter_agorot
from core.business_settings
where private.has_role(organization_id, array['admin','sales']::core.app_role[]);

create view api.project_statuses with (security_invoker = on) as
select status_code, label_ar, sort_order, is_terminal
from core.project_statuses;

-- ════════════════════════════════════════════════════════════════════════════
-- الزبائن والمشاريع
-- ════════════════════════════════════════════════════════════════════════════

create view api.customers with (security_invoker = on) as
select
  c.id as customer_id,
  c.organization_id,
  c.full_name,
  c.phone,
  c.city,
  c.address,
  c.notes,
  c.preferences,
  c.created_at,
  c.archived_at,
  (c.archived_at is not null) as is_archived
from core.customers c;

create view api.projects with (security_invoker = on) as
select
  p.id as project_id,
  p.organization_id,
  p.customer_id,
  c.full_name as customer_name,
  c.phone     as customer_phone,
  c.city      as customer_city,
  p.code,
  p.title,
  p.status_code,
  s.label_ar   as status_label,
  s.sort_order as status_order,
  s.is_terminal,
  p.priority,
  p.field_worker_id,
  fw.full_name as field_worker_name,
  p.tailor_id,
  tl.full_name as tailor_name,
  p.measurement_date,
  p.installation_date,
  p.notes,
  p.created_at,
  p.updated_at,
  p.lock_version,
  (select count(*) from core.rooms r where r.project_id = p.id)   as room_count,
  (select count(*) from core.windows w where w.project_id = p.id) as window_count
from core.projects p
join core.customers c        on c.id = p.customer_id
join core.project_statuses s on s.status_code = p.status_code
left join core.profiles fw   on fw.id = p.field_worker_id
left join core.profiles tl   on tl.id = p.tailor_id
where p.archived_at is null;

comment on view api.projects is
  'مثرى بأسماء الزبون والعامل والخياط — يوفر رحلات ذهاب وإياب على الجوال.';

create view api.rooms with (security_invoker = on) as
select id as room_id, organization_id, project_id, name, floor, sort_order
from core.rooms;

create view api.windows with (security_invoker = on) as
select
  w.id as window_id,
  w.organization_id,
  w.project_id,
  w.room_id,
  r.name as room_name,
  w.name,
  w.width_cm,
  w.height_cm,
  w.model,
  w.has_lining,
  w.track,
  w.fullness,
  w.quantity,
  w.fabric_variant_id,
  w.lining_variant_id,
  w.notes,
  w.measured_at,
  w.measured_by,
  -- نفس اشتقاق domain/pricing.ts: نطاق الارتفاع والمتر الركض
  case when w.height_cm >= 330 then 'tall' else 'standard' end::core.height_band as band,
  round((w.width_cm / 100.0) * w.quantity, 3)                as running_meters,
  round((w.width_cm / 100.0) * w.quantity * w.fullness, 3)   as fabric_meters
from core.windows w
join core.rooms r on r.id = w.room_id;

comment on column api.windows.running_meters is
  'محسوب في القاعدة ليطابق runningMeters() في التطبيق ولا يتباعدا.';

-- ════════════════════════════════════════════════════════════════════════════
-- مكتبة الأقمشة
-- ════════════════════════════════════════════════════════════════════════════

create view api.fabric_products with (security_invoker = on) as
select id as product_id, organization_id, name, kind, supplier,
       width_cm, composition, image_url
from core.fabric_products
where archived_at is null;

-- بلا تكلفة — يراه كل الأعضاء بمن فيهم الميداني والخياط
create view api.fabric_variants with (security_invoker = on) as
select
  v.id as variant_id,
  v.organization_id,
  v.product_id,
  pr.name as product_name,
  pr.kind,
  v.color_name,
  v.color_hex,
  v.sku,
  v.image_url
from core.fabric_variants v
join core.fabric_products pr on pr.id = v.product_id
where v.archived_at is null;

-- تكلفة الجملة — الأدوار المالية وحدها. شرط WHERE إلزامي هنا: RLS تحت
-- fabric_variants تسمح لكل الأعضاء بالقراءة.
create view api.fabric_variant_costs with (security_invoker = on) as
select variant_id, organization_id, cost_per_meter_agorot
from (
  select v.id as variant_id, v.organization_id, v.cost_per_meter_agorot
  from core.fabric_variants v
  where v.archived_at is null
) t
where private.has_role(t.organization_id, array['admin','sales']::core.app_role[]);

create view api.pricing_rules with (security_invoker = on) as
select id as rule_id, organization_id, band, category,
       customer_price_per_meter_agorot, tailor_cost_per_meter_agorot, updated_at
from core.pricing_rules;

comment on view api.pricing_rules is
  'أجرة الخياط موجودة هنا لأن RLS تحت الجدول تقصره على admin و sales أصلا.';

-- ════════════════════════════════════════════════════════════════════════════
-- المخزون — الرصيد مشتق من دفتر الحركة، لا مخزّن
-- ════════════════════════════════════════════════════════════════════════════

create view api.roll_balances with (security_invoker = on) as
select
  m.roll_id,
  m.organization_id,
  round(sum(case
    when m.type in ('receipt','return','adjustment_in','transfer_in')        then  m.quantity_m
    when m.type in ('consumption','damage','adjustment_out','transfer_out')  then -m.quantity_m
    else 0 end), 3) as on_hand_m,
  round(greatest(0, sum(case
    when m.type = 'reservation'          then  m.quantity_m
    when m.type = 'reservation_release'  then -m.quantity_m
    when m.type = 'consumption'          then -m.quantity_m
    else 0 end)), 3) as reserved_m,
  round(sum(case when m.type = 'consumption' then m.quantity_m else 0 end), 3) as consumed_m
from core.stock_movements m
group by m.roll_id, m.organization_id;

comment on view api.roll_balances is
  'يطابق rollBalance() في domain/inventory.ts حرفيا. لا عمود رصيد في أي جدول.';

create view api.fabric_rolls with (security_invoker = on) as
select
  r.id as roll_id,
  r.organization_id,
  r.variant_id,
  v.color_name,
  v.color_hex,
  pr.name as product_name,
  pr.kind,
  r.code,
  r.dye_lot,
  r.location,
  r.initial_meters,
  r.is_mini_roll,
  r.created_at,
  coalesce(b.on_hand_m, 0)  as on_hand_m,
  coalesce(b.reserved_m, 0) as reserved_m,
  coalesce(b.consumed_m, 0) as consumed_m,
  greatest(0, coalesce(b.on_hand_m, 0) - coalesce(b.reserved_m, 0)) as available_m,
  (greatest(0, coalesce(b.on_hand_m, 0) - coalesce(b.reserved_m, 0)) < 20) as is_low_stock
from core.fabric_rolls r
join core.fabric_variants v  on v.id = r.variant_id
join core.fabric_products pr on pr.id = v.product_id
left join api.roll_balances b on b.roll_id = r.id
where r.retired_at is null;

comment on column api.fabric_rolls.is_low_stock is
  'العتبة 20 م، مطابقة LOW_STOCK_THRESHOLD_M في التطبيق.';

create view api.stock_movements with (security_invoker = on) as
select
  m.id as movement_id,
  m.organization_id,
  m.roll_id,
  r.code as roll_code,
  m.type,
  m.quantity_m,
  case
    when m.type in ('receipt','return','adjustment_in','transfer_in')       then 'in'
    when m.type in ('consumption','damage','adjustment_out','transfer_out') then 'out'
    else 'hold'
  end as direction,
  m.project_id,
  m.reservation_id,
  m.reason,
  m.created_by,
  p.full_name as created_by_name,
  m.created_at
from core.stock_movements m
join core.fabric_rolls r  on r.id = m.roll_id
left join core.profiles p on p.id = m.created_by;

create view api.fabric_reservations with (security_invoker = on) as
select
  res.id as reservation_id,
  res.organization_id,
  res.project_id,
  res.roll_id,
  r.code as roll_code,
  v.color_name,
  res.quantity_m,
  res.consumed_m,
  round(res.quantity_m - res.consumed_m, 3) as outstanding_m,
  res.status,
  res.created_by,
  res.created_at,
  res.released_at
from core.fabric_reservations res
join core.fabric_rolls r    on r.id = res.roll_id
join core.fabric_variants v on v.id = r.variant_id;

create view api.fabric_usage with (security_invoker = on) as
select
  u.id as usage_id,
  u.organization_id,
  u.project_id,
  u.reservation_id,
  u.roll_id,
  u.planned_m,
  u.actual_m,
  u.waste_m,
  round(u.actual_m - u.planned_m, 3) as variance_m,
  (u.actual_m > u.planned_m) as over_plan,
  u.reason,
  u.created_by,
  u.created_at
from core.fabric_usage u;

-- ════════════════════════════════════════════════════════════════════════════
-- العروض — الأساسي بلا تكلفة ولا ربح لأي دور، والمالي منفصل
-- ════════════════════════════════════════════════════════════════════════════

create view api.quotations with (security_invoker = on) as
select q.id as quotation_id, q.organization_id, q.project_id,
       q.number, q.status, q.current_version_id, q.created_at, q.updated_at
from core.quotations q;

create view api.quotation_versions with (security_invoker = on) as
select
  ver.id as version_id,
  ver.organization_id,
  ver.quotation_id,
  ver.version_number,
  ver.status,
  ver.subtotal_agorot,
  ver.discount_percent,
  ver.discount_agorot,
  ver.vat_agorot,
  ver.total_agorot,
  ver.valid_until,
  (ver.valid_until < now()) as is_expired,
  ver.note,
  ver.created_by,
  ver.created_at,
  ver.sent_at,
  ver.approved_at,
  ver.locked
from core.quotation_versions ver;

comment on view api.quotation_versions is
  'بلا internal_cost_agorot ولا margin_percent — غير موجودين لأي دور، حتى الأدمن.';

create view api.quotation_version_financials with (security_invoker = on) as
select version_id, organization_id, internal_cost_agorot, margin_percent, margin_agorot
from (
  select
    ver.id as version_id,
    ver.organization_id,
    ver.internal_cost_agorot,
    ver.margin_percent,
    (ver.subtotal_agorot - ver.discount_agorot - ver.internal_cost_agorot) as margin_agorot
  from core.quotation_versions ver
) t
where private.has_role(t.organization_id, array['admin','sales']::core.app_role[]);

create view api.quotation_items with (security_invoker = on) as
select
  i.id as item_id,
  i.organization_id,
  i.version_id,
  i.window_id,
  i.room_name,
  i.window_name,
  i.description,
  i.width_cm,
  i.height_cm,
  i.running_meters,
  i.quantity,
  i.category,
  i.band,
  i.unit_price_agorot,
  i.line_total_agorot,
  i.fabric_meters,
  i.lining_meters,
  i.sort_order
from core.quotation_items i;

create view api.quotation_item_financials with (security_invoker = on) as
select item_id, organization_id, version_id, internal_cost_agorot, margin_agorot
from (
  select i.id as item_id, i.organization_id, i.version_id,
         i.internal_cost_agorot,
         (i.line_total_agorot - i.internal_cost_agorot) as margin_agorot
  from core.quotation_items i
) t
where private.has_role(t.organization_id, array['admin','sales']::core.app_role[]);

create view api.discount_requests with (security_invoker = on) as
select
  d.id as request_id,
  d.organization_id,
  d.quotation_id,
  d.version_id,
  d.requested_percent,
  d.reason,
  d.status,
  d.requested_by,
  rp.full_name as requested_by_name,
  d.decided_by,
  dp.full_name as decided_by_name,
  d.decided_at,
  d.decision_note,
  d.created_at
from core.discount_requests d
left join core.profiles rp on rp.id = d.requested_by
left join core.profiles dp on dp.id = d.decided_by;

-- ════════════════════════════════════════════════════════════════════════════
-- الإنتاج والميدان والمال
-- ════════════════════════════════════════════════════════════════════════════

create view api.tailor_assignments with (security_invoker = on) as
select
  t.id as assignment_id,
  t.organization_id,
  t.project_id,
  t.tailor_id,
  p.full_name as tailor_name,
  t.stage,
  t.instructions,
  t.due_date,
  t.started_at,
  t.completed_at,
  t.stage_history,
  t.updated_at
from core.tailor_assignments t
left join core.profiles p on p.id = t.tailor_id;

create view api.field_visits with (security_invoker = on) as
select
  v.id as visit_id,
  v.organization_id,
  v.project_id,
  pr.code  as project_code,
  c.full_name as customer_name,
  c.phone     as customer_phone,
  c.address   as customer_address,
  c.city      as customer_city,
  v.assignee_id,
  a.full_name as assignee_name,
  v.type,
  v.status,
  v.scheduled_at,
  v.started_at,
  v.completed_at,
  v.notes,
  v.check_track,
  v.check_curtain,
  v.check_height,
  v.check_cleanliness,
  v.customer_signed_off
from core.field_visits v
join core.projects pr     on pr.id = v.project_id
join core.customers c     on c.id = pr.customer_id
left join core.profiles a on a.id = v.assignee_id;

comment on view api.field_visits is
  'يحمل عنوان الزبون وهاتفه — العامل الميداني يحتاجهما للاتصال والخرائط دون نداء إضافي.';

create view api.payments with (security_invoker = on) as
select
  pay.id as payment_id,
  pay.organization_id,
  pay.project_id,
  pay.amount_agorot,
  pay.kind,
  pay.method,
  pay.reference,
  pay.note,
  pay.reversed_payment_id,
  pay.created_by,
  p.full_name as created_by_name,
  pay.created_at
from core.payments pay
left join core.profiles p on p.id = pay.created_by;

create view api.project_balances with (security_invoker = on) as
select
  pay.organization_id,
  pay.project_id,
  coalesce(sum(pay.amount_agorot), 0) as paid_agorot
from core.payments pay
group by pay.organization_id, pay.project_id;

comment on view api.project_balances is
  'المدفوع صافيا — القيود العكسية سالبة فتُطرح تلقائيا.';

create view api.attachments with (security_invoker = on) as
select id as attachment_id, organization_id, project_id, room_id, window_id,
       visit_id, kind, storage_path, caption, byte_size, created_by, created_at
from core.attachments;

-- ════════════════════════════════════════════════════════════════════════════
-- النظام
-- ════════════════════════════════════════════════════════════════════════════

create view api.notifications with (security_invoker = on) as
select id as notification_id, organization_id, user_id, kind, title, body,
       deep_link, read_at, (read_at is null) as is_unread, created_at
from core.notifications;

create view api.audit_logs with (security_invoker = on) as
select
  a.id as log_id,
  a.organization_id,
  a.actor_id,
  p.full_name as actor_name,
  a.action,
  a.entity,
  a.entity_id,
  a.summary,
  a.created_at
from core.audit_logs a
left join core.profiles p on p.id = a.actor_id;

create view api.client_operations with (security_invoker = on) as
select id as operation_id, organization_id, user_id, client_operation_id,
       idempotency_key, kind, entity_id, state, attempts, error,
       created_at, synced_at
from core.client_operations;

-- ════════════════════════════════════════════════════════════════════════════
-- الصلاحيات — قراءة فقط. كل كتابة تمر عبر RPC في الترحيل التالي.
-- ════════════════════════════════════════════════════════════════════════════

grant select on all tables in schema api to authenticated;
alter default privileges in schema api grant select on tables to authenticated;

-- anon لا يرى شيئا: لا تسجيل دخول، لا بيانات.
revoke all on all tables in schema api from anon;

notify pgrst, 'reload schema';
