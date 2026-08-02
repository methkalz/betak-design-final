-- ============================================================================
-- بيتك ديزاين — 0014 — سطح الكتابة وحُرّاس السلامة
-- المرجع: DECISIONS.md §1
--
-- اصطلاح ثابت من هنا فصاعدًا:
--   api.<entity>           تمريري 1:1 — قابل للكتابة
--   api.<entity>_details   مثرى بـjoins — قراءة فقط
--   api.<entity>_summary   تجميعي — قراءة فقط
--
-- سبب الفصل تقني لا جمالي: بوستجرس يجعل الview قابلًا للكتابة تلقائيًا فقط
-- إذا كان له مصدر FROM واحد بلا joins ولا تجميع. الviews المثراة لا يمكن
-- الكتابة عليها بأي حال.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1) صلاحيات الكتابة على الجداول المسموح بها فقط
--    بدونها تبقى سياسات INSERT/UPDATE في الترحيل 0010 كودًا ميتًا: السياسة
--    تسمح، والصلاحية غائبة، فيفشل الاستعلام بـ42501.
-- ════════════════════════════════════════════════════════════════════════════

grant insert, update on core.customers          to authenticated;
grant insert, update on core.projects           to authenticated;
grant insert, update, delete on core.rooms      to authenticated;
grant insert, update, delete on core.windows    to authenticated;
grant insert, update on core.field_visits       to authenticated;
grant insert, update on core.tailor_assignments to authenticated;
grant insert         on core.attachments        to authenticated;
grant update         on core.notifications      to authenticated;
grant insert, update, delete on core.user_devices to authenticated;
grant update         on core.profiles           to authenticated;

-- كتالوج الأقمشة: السياسات تقصره على الأدمن، والصلاحية تُمنح للدور العام
-- ثم تصفّيها RLS.
grant insert, update on core.fabric_products to authenticated;
grant insert, update on core.fabric_variants to authenticated;
grant insert, update on core.fabric_rolls    to authenticated;
grant update         on core.pricing_rules   to authenticated;

-- الجداول التالية عمدًا بلا أي صلاحية كتابة — RPC حصرًا:
--   stock_movements · fabric_reservations · fabric_usage · payments
--   quotations · quotation_versions · quotation_items · discount_requests
--   audit_logs · organizations · organization_members · business_settings
-- غياب المنح هو خط الدفاع الأول، وسياسات RLS الغائبة هي الثاني.

-- ════════════════════════════════════════════════════════════════════════════
-- 2) حُرّاس السلامة — triggers
--    الـRPCs ستنفَّذ بـsecurity definer أي بصلاحيات المالك، والمالك يتجاوز RLS.
--    فهذه الحُرّاس هي الحماية الوحيدة من RPC مكتوب بخطأ، لا من العميل فقط.
-- ════════════════════════════════════════════════════════════════════════════

-- الـRPCs تعلن عن نفسها بهذا الإعداد داخل الـtransaction:
--     perform set_config('app.rpc_context', 'on', true);
create or replace function private.in_rpc()
returns boolean language sql stable
set search_path = ''
as $$ select coalesce(current_setting('app.rpc_context', true), '') = 'on' $$;

-- ── دفاتر أستاذ لا تُعدَّل ولا تُحذف ─────────────────────────────────────────
create or replace function private.block_mutation()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  raise exception 'الجدول % دفتر أستاذ: لا تعديل ولا حذف. التصحيح بقيد معاكس.',
    TG_TABLE_NAME using errcode = '42501';
end $$;

create trigger stock_movements_immutable
  before update or delete on core.stock_movements
  for each row execute function private.block_mutation();

create trigger payments_immutable
  before update or delete on core.payments
  for each row execute function private.block_mutation();

create trigger audit_logs_immutable
  before update or delete on core.audit_logs
  for each row execute function private.block_mutation();

-- ── حالة المشروع تتغير عبر RPC حصرًا ────────────────────────────────────────
-- الكتابة المباشرة مسموحة للمسودات والملاحظات، أما «قبول العرض» و«الإغلاق»
-- فعمليات رسمية تمس عدة جداول.
create or replace function private.guard_project_update()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.status_code is distinct from old.status_code and not private.in_rpc() then
    raise exception 'تغيير حالة المشروع يتم عبر RPC حصرًا (الحالية %، المطلوبة %)',
      old.status_code, new.status_code using errcode = '42501';
  end if;

  -- قفل تفاؤلي: كل تحديث يرفع النسخة، وأي كتابة بنسخة قديمة تُرفض
  if new.lock_version is not distinct from old.lock_version then
    new.lock_version := old.lock_version + 1;
  elsif new.lock_version <> old.lock_version + 1 then
    raise exception 'تعارض تعديل: المشروع عُدّل من جهة أخرى. أعد التحميل.'
      using errcode = '40001';
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger projects_guard
  before update on core.projects
  for each row execute function private.guard_project_update();

-- ── نسخة العرض المقفلة لقطة مجمدة ───────────────────────────────────────────
create or replace function private.guard_locked_version()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if old.locked then
    if new.subtotal_agorot   is distinct from old.subtotal_agorot
    or new.discount_percent  is distinct from old.discount_percent
    or new.discount_agorot   is distinct from old.discount_agorot
    or new.vat_agorot        is distinct from old.vat_agorot
    or new.total_agorot      is distinct from old.total_agorot
    or new.internal_cost_agorot is distinct from old.internal_cost_agorot
    or new.valid_until       is distinct from old.valid_until then
      raise exception 'النسخة % مقفلة: أنشئ نسخة جديدة بدل تعديلها.',
        old.version_number using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger quotation_versions_guard
  before update on core.quotation_versions
  for each row execute function private.guard_locked_version();

create or replace function private.guard_locked_items()
returns trigger language plpgsql
set search_path = ''
as $$
declare v_locked boolean;
begin
  select qv.locked into v_locked
  from core.quotation_versions qv
  where qv.id = coalesce(new.version_id, old.version_id);

  if v_locked then
    raise exception 'بنود نسخة مقفلة لا تُمس.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

create trigger quotation_items_guard
  before insert or update or delete on core.quotation_items
  for each row execute function private.guard_locked_items();

-- ── الأرشفة بدل الحذف ───────────────────────────────────────────────────────
create or replace function private.block_delete()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  raise exception 'لا حذف فعلي لـ%. استخدم الأرشفة (archived_at).', TG_TABLE_NAME
    using errcode = '42501';
end $$;

create trigger customers_no_delete
  before delete on core.customers
  for each row execute function private.block_delete();

create trigger projects_no_delete
  before delete on core.projects
  for each row execute function private.block_delete();

-- ════════════════════════════════════════════════════════════════════════════
-- 3) سطح الكتابة — views تمريرية 1:1
--    شرط قابلية الكتابة: مصدر FROM واحد، بلا joins ولا تجميع ولا DISTINCT.
--    الأعمدة المحسوبة مسموحة (تُقرأ ولا يُكتب عليها).
-- ════════════════════════════════════════════════════════════════════════════

-- api.customers و api.rooms و api.attachments و api.notifications من الترحيل
-- 0011 تمريرية أصلًا فتبقى كما هي وتصير قابلة للكتابة بمنح الصلاحيات أعلاه.

drop view if exists api.projects;
create view api.projects with (security_invoker = on) as
select
  id as project_id, organization_id, customer_id, code, title, status_code,
  priority, field_worker_id, tailor_id, measurement_date, installation_date,
  notes, created_at, updated_at, archived_at, lock_version
from core.projects;

comment on view api.projects is
  'تمريري قابل للكتابة: إنشاء مسودة وتعديل البيانات الوصفية. تغيير status_code '
  'يرفضه trigger — يمر عبر RPC. للعرض المثرى استخدم api.project_details.';

drop view if exists api.windows;
create view api.windows with (security_invoker = on) as
select
  id as window_id, organization_id, project_id, room_id, name,
  width_cm, height_cm, model, has_lining, track, fullness, quantity,
  fabric_variant_id, lining_variant_id, notes, measured_at, measured_by
from core.windows;

drop view if exists api.field_visits;
create view api.field_visits with (security_invoker = on) as
select
  id as visit_id, organization_id, project_id, assignee_id, type, status,
  scheduled_at, started_at, completed_at, notes,
  check_track, check_curtain, check_height, check_cleanliness,
  customer_signed_off, created_at
from core.field_visits;

drop view if exists api.tailor_assignments;
create view api.tailor_assignments with (security_invoker = on) as
select
  id as assignment_id, organization_id, project_id, tailor_id, stage,
  instructions, due_date, started_at, completed_at, stage_history, updated_at
from core.tailor_assignments;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) سطح القراءة — views مثراة، قراءة فقط
-- ════════════════════════════════════════════════════════════════════════════

create view api.project_details with (security_invoker = on) as
select
  p.id as project_id,
  p.organization_id,
  p.customer_id,
  c.full_name as customer_name,     -- LEFT JOIN: فارغ لمن لا يحق له رؤيته
  c.phone     as customer_phone,
  c.city      as customer_city,
  c.address   as customer_address,
  p.code, p.title, p.status_code,
  s.label_ar as status_label, s.sort_order as status_order, s.is_terminal,
  p.priority,
  p.field_worker_id, fw.full_name as field_worker_name,
  p.tailor_id,       tl.full_name as tailor_name,
  p.measurement_date, p.installation_date, p.notes,
  p.created_at, p.updated_at, p.lock_version,
  (select count(*) from core.rooms   r where r.project_id = p.id) as room_count,
  (select count(*) from core.windows w where w.project_id = p.id) as window_count
from core.projects p
left join core.customers c        on c.id = p.customer_id
join      core.project_statuses s on s.status_code = p.status_code
left join core.profiles fw        on fw.id = p.field_worker_id
left join core.profiles tl        on tl.id = p.tailor_id
where p.archived_at is null;

-- شاشة الخياط: مقاسات وتعليمات فقط. لا تكلفة ولا ربح ولا بيانات زبون.
create view api.tailor_project_details with (security_invoker = on) as
select
  p.id as project_id,
  p.organization_id,
  p.code, p.title, p.status_code,
  p.installation_date,
  t.stage, t.instructions, t.due_date, t.started_at, t.completed_at,
  (select count(*) from core.windows w where w.project_id = p.id) as window_count,
  (select coalesce(sum(round((w.width_cm/100.0)*w.quantity*w.fullness, 3)), 0)
     from core.windows w where w.project_id = p.id) as total_fabric_meters
from core.projects p
join core.tailor_assignments t on t.project_id = p.id
where p.archived_at is null
  and private.has_role(p.organization_id, array['admin','tailor']::core.app_role[]);

comment on view api.tailor_project_details is
  'لا عمود تكلفة ولا ربح ولا بيانات زبون — غائبة من التعريف أصلًا لا مخفية.';

create view api.window_details with (security_invoker = on) as
select
  w.id as window_id, w.organization_id, w.project_id, w.room_id,
  r.name as room_name, w.name,
  w.width_cm, w.height_cm, w.model, w.has_lining, w.track,
  w.fullness, w.quantity,
  w.fabric_variant_id, fv.color_name as fabric_color, fp.name as fabric_product,
  w.lining_variant_id,
  w.notes, w.measured_at, w.measured_by,
  case when w.height_cm >= 330 then 'tall' else 'standard' end::core.height_band as band,
  round((w.width_cm / 100.0) * w.quantity, 3)              as running_meters,
  round((w.width_cm / 100.0) * w.quantity * w.fullness, 3) as fabric_meters
from core.windows w
join core.rooms r                on r.id = w.room_id
left join core.fabric_variants fv on fv.id = w.fabric_variant_id
left join core.fabric_products fp on fp.id = fv.product_id;

create view api.field_visit_details with (security_invoker = on) as
select
  v.id as visit_id, v.organization_id, v.project_id,
  pr.code as project_code, pr.title as project_title,
  c.full_name as customer_name, c.phone as customer_phone,
  c.address as customer_address, c.city as customer_city,
  v.assignee_id, a.full_name as assignee_name,
  v.type, v.status, v.scheduled_at, v.started_at, v.completed_at, v.notes,
  v.check_track, v.check_curtain, v.check_height, v.check_cleanliness,
  v.customer_signed_off
from core.field_visits v
join core.projects pr      on pr.id = v.project_id
left join core.customers c on c.id = pr.customer_id
left join core.profiles a  on a.id = v.assignee_id;

create view api.customer_balance_summary with (security_invoker = on) as
select
  c.id as customer_id,
  c.organization_id,
  c.full_name,
  count(distinct p.id)                       as project_count,
  coalesce(sum(pay.amount_agorot), 0)        as paid_agorot
from core.customers c
left join core.projects p  on p.customer_id = c.id
left join core.payments pay on pay.project_id = p.id
group by c.id, c.organization_id, c.full_name;

-- إعادة تسمية بمفردات الفريق
drop view if exists api.fabric_roll_stock;
create view api.inventory_roll_balances with (security_invoker = on) as
select
  r.id as roll_id, r.organization_id, r.code, r.dye_lot, r.location,
  v.color_name, pr.name as product_name,
  coalesce(b.on_hand_m, 0)  as on_hand_m,
  coalesce(b.reserved_m, 0) as reserved_m,
  coalesce(b.consumed_m, 0) as consumed_m,
  greatest(0, coalesce(b.on_hand_m, 0) - coalesce(b.reserved_m, 0)) as available_m,
  (greatest(0, coalesce(b.on_hand_m, 0) - coalesce(b.reserved_m, 0)) < 20) as is_low_stock
from core.fabric_rolls r
join core.fabric_variants v  on v.id = r.variant_id
join core.fabric_products pr on pr.id = v.product_id
left join api.roll_balances b on b.roll_id = r.id
where r.retired_at is null
  and private.has_role(r.organization_id, array['admin','sales']::core.app_role[]);

grant select on all tables in schema api to authenticated;

-- الكتابة على الviews التمريرية وحدها
grant insert, update on api.projects, api.customers to authenticated;
grant insert, update, delete on api.rooms, api.windows to authenticated;
grant insert, update on api.field_visits, api.tailor_assignments to authenticated;
grant insert on api.attachments to authenticated;
grant update on api.notifications to authenticated;

revoke all on all tables in schema api from anon;

notify pgrst, 'reload schema';
