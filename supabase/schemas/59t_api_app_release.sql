-- ════════════════════════════════════════════════════════════════════
-- سياسة إصدارات المتجر: قراءةٌ لكلّ داخل، وضبطٌ للأدمن
-- مرآة الترحيل 20261111120001_app_release_policy.sql - النصّ نفسه حرفيًّا.
-- ⚠️ الملكية والمنح وصفّا البذرة لا يلتقطها db diff — مكانها الترحيل.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.app_release_policy(p_platform text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'latest_build', p.latest_build,
    'min_build', p.min_build,
    'ios_app_store_id', p.ios_app_store_id)
  from core.app_release_policy p
  where p.platform = p_platform;
$function$;

CREATE OR REPLACE FUNCTION api.set_app_release_policy(p_platform text, p_latest_build integer, p_min_build integer, p_ios_app_store_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_ios text := nullif(btrim(coalesce(p_ios_app_store_id, '')), '');
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  v_org := private.current_org();
  if v_org is null or not private.is_admin(v_org) then
    raise exception 'إصدارات المتجر للأدمن وحده.' using errcode = 'BD403';
  end if;
  -- السياسة عامّة لكلّ المحلّات: يضبطها أدمن المحلّ المالك وحده
  if (select o.manages_app_releases from core.organizations o where o.id = v_org) is not true then
    raise exception 'إصدارات التطبيق يضبطها المحلّ المالك وحده.' using errcode = 'BD403';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'المنصّة ios أو android.' using errcode = 'BD400';
  end if;
  if p_latest_build is null or p_min_build is null or p_min_build < 0 or p_latest_build < p_min_build then
    raise exception 'الحدّ الأدنى بين صفر وأحدث رقم بناء.' using errcode = 'BD400';
  end if;
  if v_ios is not null and v_ios !~ '^[0-9]{6,12}$' then
    raise exception 'معرّف App Store أرقامٌ فقط (كما في رابط التطبيق بعد id).' using errcode = 'BD400';
  end if;

  update core.app_release_policy
  set latest_build = p_latest_build, min_build = p_min_build,
      ios_app_store_id = case when p_platform = 'ios' then v_ios else ios_app_store_id end,
      updated_at = now(), updated_by = v_uid
  where platform = p_platform;

  insert into core.audit_logs (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'settings.app_release', 'app_release_policy', p_platform,
          format('إصدارات %s: أحدث %s، أدنى %s', p_platform, p_latest_build, p_min_build),
          jsonb_build_object('platform', p_platform, 'latest_build', p_latest_build,
                             'min_build', p_min_build, 'ios_app_store_id', v_ios));

  return api.app_release_policy(p_platform);
end
$function$;
