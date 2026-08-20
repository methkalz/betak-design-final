-- ════════════════════════════════════════════════════════════════════
-- دوال الصلاحيات — بترتيب الاعتماد
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION private.is_org_member(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from core.organization_members om
    where om.organization_id = p_org
      and om.user_id = (select auth.uid())
      and om.is_active
  );
$function$;

CREATE OR REPLACE FUNCTION private.role_in(p_org uuid)
 RETURNS core.app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select om.role
  from core.organization_members om
  where om.organization_id = p_org
    and om.user_id = (select auth.uid())
    and om.is_active;
$function$;

CREATE OR REPLACE FUNCTION private.has_role(p_org uuid, p_roles core.app_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from core.organization_members om
    where om.organization_id = p_org
      and om.user_id = (select auth.uid())
      and om.is_active
      and om.role = any (p_roles)
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_admin(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.has_role(p_org, array['admin']::core.app_role[]);
$function$;

CREATE OR REPLACE FUNCTION private.is_financially_blind(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.has_role(p_org, array['field','tailor']::core.app_role[]);
$function$;

CREATE OR REPLACE FUNCTION private.can_see_project(p_org uuid, p_project uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- الملحق يتبع أصله في الرؤية: من يرى البيت يرى ما أُضيف إليه
  with target as (
    select coalesce(p.parent_project_id, p.id) as root_id
    from core.projects p where p.id = p_project and p.organization_id = p_org
  )
  select case private.role_in(p_org)
    when 'admin' then true
    when 'sales' then true
    when 'tailor' then exists (
      select 1 from core.projects p, target t
      where p.organization_id = p_org
        and (p.id = t.root_id or p.parent_project_id = t.root_id)
        and p.tailor_id = (select auth.uid())
    )
    when 'field' then exists (
      select 1 from core.projects p, target t
      where p.organization_id = p_org
        and (p.id = t.root_id or p.parent_project_id = t.root_id)
        and (p.field_worker_id = (select auth.uid())
             or p.installer_id = (select auth.uid()))
    ) or exists (
      select 1 from core.field_visits v, target t
      where v.organization_id = p_org
        and v.assignee_id = (select auth.uid())
        and (v.project_id = t.root_id
             or v.project_id in (select p2.id from core.projects p2
                                 where p2.parent_project_id = t.root_id))
    )
    else false
  end;
$function$;

CREATE OR REPLACE FUNCTION private.capability_known(p_capability text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select p_capability in (
    'view_cost_and_margin', 'edit_pricing_rules', 'manage_customers',
    'enter_measurements', 'reserve_fabric', 'update_production',
    'record_payment', 'approve_discount', 'manage_users', 'manage_fabrics',
    'receive_own_fabric', 'view_reports', 'create_quotation', 'install')
$function$;

CREATE OR REPLACE FUNCTION private.capability_can(p_role core.app_role, p_capability text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  -- مرآة حرفية لمصفوفة expo/domain/permissions.ts (yes|limited = true).
  -- تغييرٌ هناك يستلزم تغييرًا هنا - ومجموعة البوابة تفحص التطابق
  select case p_role
    when 'admin' then private.capability_known(p_capability)
    when 'sales' then p_capability in (
      'view_cost_and_margin', 'manage_customers', 'enter_measurements',
      'reserve_fabric', 'record_payment', 'view_reports', 'create_quotation')
    when 'field' then p_capability in (
      'manage_customers', 'enter_measurements', 'install')
    when 'tailor' then p_capability in (
      'update_production', 'receive_own_fabric')
    else false
  end
$function$;

