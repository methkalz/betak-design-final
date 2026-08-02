-- ════════════════════════════════════════════════════════════════════
-- دوال الهوية
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION private.current_uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select nullif(
    coalesce(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), ''
  )::uuid;
$function$;

CREATE OR REPLACE FUNCTION private.in_rpc()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select coalesce(current_setting('app.rpc_context', true), '') = 'on' $function$;
