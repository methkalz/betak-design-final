-- ============================================================================
-- بيتك ديزاين — 0013 — تصحيح فخّ الـinner join مع RLS
--
-- الدرس العام: في view بـsecurity_invoker، أي INNER JOIN إلى جدول محكوم بـRLS
-- يتحول إلى **فلتر صامت**. إن لم يستطع المستخدم قراءة الصف المرتبط، اختفى
-- الصف الأصلي كله. هذا لا يظهر في مراجعة الكود ولا في اختبار بدور postgres —
-- يظهر فقط باختبار بالدور الحقيقي.
-- ============================================================================

-- ── 1) api.projects — الخياط كان يرى صفر مشاريع ─────────────────────────────
-- كان JOIN core.customers، والخياط بلا سياسة قراءة على الزبائن، فمُحيت صفوفه.
-- الإصلاح LEFT JOIN: المشروع يظهر، وبيانات الزبون تأتي فارغة لمن لا يحق له
-- رؤيتها. هذا هو السلوك المطلوب أصلًا — الخياط يعمل من المقاسات والتعليمات،
-- ولا شأن له باسم الزبون وهاتفه وعنوانه.
drop view if exists api.projects;

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
left join core.customers c        on c.id = p.customer_id
join      core.project_statuses s on s.status_code = p.status_code
left join core.profiles fw        on fw.id = p.field_worker_id
left join core.profiles tl        on tl.id = p.tailor_id
where p.archived_at is null;

comment on view api.projects is
  'LEFT JOIN على الزبائن مقصود: الخياط يرى مشروعه وبيانات الزبون فارغة. '
  'INNER JOIN كان يحذف صفوفه بالكامل. project_statuses يبقى INNER — مرجعي عام.';

-- ── 2) api.fabric_rolls — رصيد صفري مضلّل ───────────────────────────────────
-- دفتر الحركة محكوم بـadmin/sales، فكان coalesce(...,0) يُظهر للميداني والخياط
-- «متاح 0» و«مخزون منخفض» عن رول ممتلئ. الفرق بين «صفر» و«لا أعرف» جوهري هنا.
-- الحل نفس نمط الviews المالية: كتالوج للجميع، وأرصدة في view محكوم.
drop view if exists api.fabric_rolls;

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
  r.created_at
from core.fabric_rolls r
join core.fabric_variants v  on v.id = r.variant_id
join core.fabric_products pr on pr.id = v.product_id
where r.retired_at is null;

comment on view api.fabric_rolls is
  'كتالوج الرولات لكل الأعضاء — بلا أرصدة. الأرصدة في api.fabric_roll_stock.';

create view api.fabric_roll_stock with (security_invoker = on) as
select
  r.id as roll_id,
  r.organization_id,
  r.code,
  coalesce(b.on_hand_m, 0)  as on_hand_m,
  coalesce(b.reserved_m, 0) as reserved_m,
  coalesce(b.consumed_m, 0) as consumed_m,
  greatest(0, coalesce(b.on_hand_m, 0) - coalesce(b.reserved_m, 0)) as available_m,
  (greatest(0, coalesce(b.on_hand_m, 0) - coalesce(b.reserved_m, 0)) < 20) as is_low_stock
from core.fabric_rolls r
left join api.roll_balances b on b.roll_id = r.id
where r.retired_at is null
  and private.has_role(r.organization_id, array['admin','sales']::core.app_role[]);

comment on view api.fabric_roll_stock is
  'الأرصدة للأدوار المخوّلة وحدها. coalesce آمن هنا: من يصل يرى الحركات كلها، '
  'فالصفر يعني صفرًا حقيقيًا لا نقص صلاحية. العتبة 20 م = LOW_STOCK_THRESHOLD_M.';

grant select on api.projects, api.fabric_rolls, api.fabric_roll_stock to authenticated;

notify pgrst, 'reload schema';
