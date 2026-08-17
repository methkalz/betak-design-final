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
        and (p.field_worker_id = (select auth.uid())
             -- المركّب يرى مشروعه: إسناد التركيب يكتب installer_id وحده،
             -- وإغفاله هنا كان يُعمي المركّب عن المشروع فتتعطل رجل التركيب
             or p.installer_id = (select auth.uid()))
    ) or exists (
      select 1 from core.field_visits v
      where v.project_id = p_project
        and v.organization_id = p_org
        and v.assignee_id = (select auth.uid())
    )
    else false
  end;
$function$;
