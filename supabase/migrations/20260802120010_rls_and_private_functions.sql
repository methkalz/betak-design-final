-- ============================================================================
-- بيتك ديزاين — 0010 — دوال الصلاحيات وسياسات RLS
-- المرجع: security.html (مبادئ RLS)، sql.html (عضوية المؤسسة)
--
-- النموذج الأمني في جملة واحدة:
--   التطبيق يقرأ عبر views في api موسومة بـ security_invoker، فتنطبق سياسات
--   RLS أدناه بهوية المستخدم نفسه. أما الكتابة الحساسة — مال، مخزون، خصم،
--   حالة رسمية — فلا سياسة تسمح بها إطلاقا: تمر عبر RPC موقعة حصرا.
--
-- لذلك غياب سياسة INSERT على جدول ليس سهوا، بل هو التصميم.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1) دوال private
-- كلها security definer بـ search_path فارغ، وبلا EXECUTE للعملاء.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function private.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from core.organization_members om
    where om.organization_id = p_org
      and om.user_id = (select auth.uid())
      and om.is_active
  );
$$;

comment on function private.is_org_member(uuid) is
  'أساس كل سياسة. (select auth.uid()) داخل قوسين ليخزنه المخطط كـ initplan مرة واحدة.';

create or replace function private.role_in(p_org uuid)
returns core.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select om.role
  from core.organization_members om
  where om.organization_id = p_org
    and om.user_id = (select auth.uid())
    and om.is_active;
$$;

create or replace function private.has_role(p_org uuid, p_roles core.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from core.organization_members om
    where om.organization_id = p_org
      and om.user_id = (select auth.uid())
      and om.is_active
      and om.role = any (p_roles)
  );
$$;

create or replace function private.is_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(p_org, array['admin']::core.app_role[]);
$$;

/**
 * أي مشاريع يرى هذا المستخدم؟
 *   admin / sales : كل مشاريع المؤسسة
 *   tailor        : المسندة إليه فقط
 *   field         : المسندة إليه، أو التي له فيها زيارة
 */
create or replace function private.can_see_project(p_org uuid, p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case private.role_in(p_org)
    when 'admin' then true
    when 'sales' then true
    when 'tailor' then exists (
      select 1 from core.projects p
      where p.id = p_project
        and p.organization_id = p_org
        and p.tailor_id = (select auth.uid())
    )
    when 'field' then exists (
      select 1 from core.projects p
      where p.id = p_project
        and p.organization_id = p_org
        and p.field_worker_id = (select auth.uid())
    ) or exists (
      select 1 from core.field_visits v
      where v.project_id = p_project
        and v.organization_id = p_org
        and v.assignee_id = (select auth.uid())
    )
    else false
  end;
$$;

comment on function private.can_see_project(uuid, uuid) is
  'الخياط يرى مشاريعه فقط، والميداني زياراته فقط — security.html.';

/** الأدوار المحجوبة ماليا. الربح والتكلفة يغيبان عن views هذه الأدوار أصلا. */
create or replace function private.is_financially_blind(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(p_org, array['field','tailor']::core.app_role[]);
$$;

-- لا ينفذها عميل. تستدعى من داخل السياسات ومن دوال api فقط.
revoke all on all functions in schema private from anon, authenticated, public;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) تفعيل RLS على كل جدول
-- force يشمل مالك الجدول أيضا، فلا ينفذ أحد من الباب الخلفي.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'profiles', 'organization_members', 'business_settings',
    'user_devices', 'fabric_products', 'fabric_variants', 'fabric_rolls',
    'pricing_rules', 'customers', 'project_statuses', 'projects', 'rooms',
    'windows', 'fabric_reservations', 'stock_movements', 'fabric_usage',
    'quotations', 'quotation_versions', 'quotation_items', 'discount_requests',
    'tailor_assignments', 'field_visits', 'payments', 'attachments',
    'notifications', 'audit_logs', 'client_operations'
  ]
  loop
    execute format('alter table core.%I enable row level security', t);
    execute format('alter table core.%I force row level security', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3) الصلاحيات الخام
-- العميل لا يلمس core مباشرة؛ يصل عبر views في api موسومة security_invoker،
-- وهي تحتاج SELECT على الجداول الأصلية بهوية المستدعي. لذا نمنح SELECT فقط،
-- والكتابة تبقى حكرا على دوال security definer.
-- ════════════════════════════════════════════════════════════════════════════

grant usage on schema core to authenticated;
grant select on all tables in schema core to authenticated;

-- استثناء: تكلفة الجملة وأجرة الخياط. الحماية الحقيقية أن تغيب هذه الأعمدة
-- عن views الأدوار المحجوبة (0011)، وهذا صف دفاع ثانٍ على مستوى الجدول.
revoke select on core.business_settings from authenticated;
grant select (
  organization_id, min_margin_percent, employee_discount_limit_percent,
  admin_discount_limit_percent, quotation_validity_days, vat_percent, currency
) on core.business_settings to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) السياسات
-- ════════════════════════════════════════════════════════════════════════════

-- ── المؤسسة والحسابات ───────────────────────────────────────────────────────

create policy "members read own organization"
  on core.organizations for select to authenticated
  using (private.is_org_member(id));

create policy "members read colleagues"
  on core.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from core.organization_members mine
      join core.organization_members theirs
        on theirs.organization_id = mine.organization_id
      where mine.user_id = (select auth.uid())
        and mine.is_active
        and theirs.user_id = core.profiles.id
    )
  );

create policy "user updates own profile"
  on core.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "members read memberships"
  on core.organization_members for select to authenticated
  using (private.is_org_member(organization_id));

create policy "members read settings"
  on core.business_settings for select to authenticated
  using (private.is_org_member(organization_id));

-- الأجهزة: كل مستخدم يدير أجهزته هو
create policy "user manages own devices"
  on core.user_devices for all to authenticated
  using (user_id = (select auth.uid()) and private.is_org_member(organization_id))
  with check (user_id = (select auth.uid()) and private.is_org_member(organization_id));

-- ── مكتبة الأقمشة ───────────────────────────────────────────────────────────
-- القراءة لكل الأعضاء (الميداني يحتاج رؤية القماش)، والتعديل للأدمن.
-- إخفاء التكلفة يتم في طبقة api لا هنا.

create policy "members read products"
  on core.fabric_products for select to authenticated
  using (private.is_org_member(organization_id));

create policy "admin writes products"
  on core.fabric_products for all to authenticated
  using (private.is_admin(organization_id))
  with check (private.is_admin(organization_id));

create policy "members read variants"
  on core.fabric_variants for select to authenticated
  using (private.is_org_member(organization_id));

create policy "admin writes variants"
  on core.fabric_variants for all to authenticated
  using (private.is_admin(organization_id))
  with check (private.is_admin(organization_id));

create policy "members read rolls"
  on core.fabric_rolls for select to authenticated
  using (private.is_org_member(organization_id));

create policy "admin writes rolls"
  on core.fabric_rolls for all to authenticated
  using (private.is_admin(organization_id))
  with check (private.is_admin(organization_id));

-- قواعد التسعير: الأدمن وحده يعدل (roles.html)
create policy "pricing readable by pricing roles"
  on core.pricing_rules for select to authenticated
  using (private.has_role(organization_id, array['admin','sales']::core.app_role[]));

create policy "admin writes pricing"
  on core.pricing_rules for all to authenticated
  using (private.is_admin(organization_id))
  with check (private.is_admin(organization_id));

-- ── الزبائن ─────────────────────────────────────────────────────────────────
-- الميداني يرى زبائن مشاريعه فقط، لا دفتر العناوين كله.

create policy "sales and admin read all customers"
  on core.customers for select to authenticated
  using (private.has_role(organization_id, array['admin','sales']::core.app_role[]));

create policy "field reads customers of own projects"
  on core.customers for select to authenticated
  using (
    private.has_role(organization_id, array['field']::core.app_role[])
    and exists (
      -- التأهيل بـ customers لازم: الاسم id موجود في p أيضا فيحجبه النطاق الداخلي
      select 1 from core.projects p
      where p.customer_id = customers.id
        and p.organization_id = customers.organization_id
        and private.can_see_project(p.organization_id, p.id)
    )
  );

create policy "sales and admin write customers"
  on core.customers for insert to authenticated
  with check (private.has_role(organization_id, array['admin','sales']::core.app_role[]));

create policy "sales and admin update customers"
  on core.customers for update to authenticated
  using (private.has_role(organization_id, array['admin','sales']::core.app_role[]))
  with check (private.has_role(organization_id, array['admin','sales']::core.app_role[]));

-- لا سياسة DELETE: الأرشفة عبر update على archived_at.

-- ── المشاريع والغرف والشبابيك ───────────────────────────────────────────────

create policy "read visible projects"
  on core.projects for select to authenticated
  using (private.can_see_project(organization_id, id));

create policy "sales and admin create projects"
  on core.projects for insert to authenticated
  with check (private.has_role(organization_id, array['admin','sales']::core.app_role[]));

-- تحديث بيانات المشروع الوصفية فقط. تغيير status_code عملية رسمية تمر بـ RPC
-- (trigger في 0012 سيرفض تعديل status_code من خارج الدوال الموقعة).
create policy "sales and admin update projects"
  on core.projects for update to authenticated
  using (private.has_role(organization_id, array['admin','sales']::core.app_role[]))
  with check (private.has_role(organization_id, array['admin','sales']::core.app_role[]));

create policy "read rooms of visible projects"
  on core.rooms for select to authenticated
  using (private.can_see_project(organization_id, project_id));

create policy "measurement roles write rooms"
  on core.rooms for all to authenticated
  using (
    private.has_role(organization_id, array['admin','sales','field']::core.app_role[])
    and private.can_see_project(organization_id, project_id)
  )
  with check (
    private.has_role(organization_id, array['admin','sales','field']::core.app_role[])
    and private.can_see_project(organization_id, project_id)
  );

create policy "read windows of visible projects"
  on core.windows for select to authenticated
  using (private.can_see_project(organization_id, project_id));

create policy "measurement roles write windows"
  on core.windows for all to authenticated
  using (
    private.has_role(organization_id, array['admin','sales','field']::core.app_role[])
    and private.can_see_project(organization_id, project_id)
  )
  with check (
    private.has_role(organization_id, array['admin','sales','field']::core.app_role[])
    and private.can_see_project(organization_id, project_id)
  );

-- حالات المشروع بيانات مرجعية عامة
create policy "anyone reads statuses"
  on core.project_statuses for select to authenticated
  using (true);

-- ── المخزون: قراءة فقط للعملاء، والكتابة عبر RPC حصرا ───────────────────────

create policy "stock roles read reservations"
  on core.fabric_reservations for select to authenticated
  using (private.has_role(organization_id, array['admin','sales']::core.app_role[]));

create policy "tailor reads reservations of own projects"
  on core.fabric_reservations for select to authenticated
  using (
    private.has_role(organization_id, array['tailor']::core.app_role[])
    and private.can_see_project(organization_id, project_id)
  );

create policy "stock roles read movements"
  on core.stock_movements for select to authenticated
  using (private.has_role(organization_id, array['admin','sales']::core.app_role[]));

create policy "stock roles read usage"
  on core.fabric_usage for select to authenticated
  using (private.has_role(organization_id, array['admin','sales']::core.app_role[]));

create policy "tailor reads own usage"
  on core.fabric_usage for select to authenticated
  using (
    private.has_role(organization_id, array['tailor']::core.app_role[])
    and private.can_see_project(organization_id, project_id)
  );

-- لا INSERT ولا UPDATE ولا DELETE على الثلاثة أعلاه — بقصد.
-- api.reserve_fabric و api.consume_fabric وأخواتهما هي المنفذ الوحيد.

-- ── العروض والخصومات: قراءة للأدوار المالية، وكتابة عبر RPC ─────────────────

create policy "sales roles read quotations"
  on core.quotations for select to authenticated
  using (private.has_role(organization_id, array['admin','sales']::core.app_role[]));

create policy "sales roles read versions"
  on core.quotation_versions for select to authenticated
  using (private.has_role(organization_id, array['admin','sales']::core.app_role[]));

create policy "sales roles read items"
  on core.quotation_items for select to authenticated
  using (private.has_role(organization_id, array['admin','sales']::core.app_role[]));

create policy "sales roles read discount requests"
  on core.discount_requests for select to authenticated
  using (private.has_role(organization_id, array['admin','sales']::core.app_role[]));

-- ── الإنتاج والميدان ────────────────────────────────────────────────────────

create policy "read visible tailor assignments"
  on core.tailor_assignments for select to authenticated
  using (private.can_see_project(organization_id, project_id));

-- الخياط يحرك مرحلة الإنتاج لمشروعه. المرحلة تتقدم فقط — يفرضه trigger في 0012.
create policy "tailor advances own assignment"
  on core.tailor_assignments for update to authenticated
  using (
    tailor_id = (select auth.uid())
    and private.has_role(organization_id, array['tailor']::core.app_role[])
  )
  with check (
    tailor_id = (select auth.uid())
    and private.has_role(organization_id, array['tailor']::core.app_role[])
  );

create policy "admin manages assignments"
  on core.tailor_assignments for all to authenticated
  using (private.is_admin(organization_id))
  with check (private.is_admin(organization_id));

create policy "read own or managed visits"
  on core.field_visits for select to authenticated
  using (
    assignee_id = (select auth.uid())
    or private.has_role(organization_id, array['admin','sales']::core.app_role[])
  );

create policy "assignee updates own visit"
  on core.field_visits for update to authenticated
  using (assignee_id = (select auth.uid()))
  with check (assignee_id = (select auth.uid()));

create policy "admin and sales schedule visits"
  on core.field_visits for insert to authenticated
  with check (private.has_role(organization_id, array['admin','sales']::core.app_role[]));

-- ── المال: قراءة للأدوار المالية، ولا كتابة إطلاقا ──────────────────────────

create policy "finance roles read payments"
  on core.payments for select to authenticated
  using (private.has_role(organization_id, array['admin','sales']::core.app_role[]));

-- api.record_payment و api.reverse_payment هما المنفذ الوحيد.

-- ── المرفقات ────────────────────────────────────────────────────────────────

create policy "read attachments of visible projects"
  on core.attachments for select to authenticated
  using (private.can_see_project(organization_id, project_id));

create policy "upload to visible projects"
  on core.attachments for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.can_see_project(organization_id, project_id)
  );

-- ── الإشعارات والتدقيق والمزامنة ────────────────────────────────────────────

create policy "user reads own notifications"
  on core.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user marks own notifications read"
  on core.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- سجل التدقيق: الأدمن يقرأ، ولا أحد يكتب أو يعدل من جهة العميل
create policy "admin reads audit log"
  on core.audit_logs for select to authenticated
  using (private.is_admin(organization_id));

create policy "user reads own operations"
  on core.client_operations for select to authenticated
  using (user_id = (select auth.uid()));
