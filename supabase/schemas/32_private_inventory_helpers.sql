-- ════════════════════════════════════════════════════════════════════
-- مساعدات المخزون
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION private.reservation_remaining(p_reservation_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select pg_catalog.round(quantity_m - consumed_m - released_m, 3)
  from core.fabric_reservations where id = p_reservation_id;
$function$;
