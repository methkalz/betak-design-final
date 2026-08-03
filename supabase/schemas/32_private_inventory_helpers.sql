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
  select pg_catalog.round(quantity_m - consumed_m - released_m - damaged_reserved_m, 3)
  from core.fabric_reservations where id = p_reservation_id;
$function$;

CREATE OR REPLACE FUNCTION private.roll_balance(p_roll_id uuid)
 RETURNS TABLE(on_hand_m numeric, reserved_m numeric, available_m numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with agg as (
    select
      pg_catalog.round(coalesce(sum(m.quantity_m * e.on_hand_sign),  0), 3) as oh,
      greatest(0,
        pg_catalog.round(coalesce(sum(m.quantity_m * e.reserved_sign), 0), 3)) as rs
    from core.stock_movements m
    join core.movement_effects e on e.type = m.type
    where m.roll_id = p_roll_id
  )
  select oh, rs, greatest(0, pg_catalog.round(oh - rs, 3)) from agg;
$function$;

CREATE OR REPLACE FUNCTION private.reservation_status_for(p_quantity numeric, p_consumed numeric, p_released numeric, p_damaged numeric)
 RETURNS core.reservation_status
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when pg_catalog.round(p_quantity - p_consumed - p_released - p_damaged, 3) > 0 then
      case when p_consumed > 0 then 'partially_consumed'::core.reservation_status
           else 'active'::core.reservation_status end
    when p_consumed = p_quantity then 'consumed'::core.reservation_status
    when p_released = p_quantity then 'released'::core.reservation_status
    else 'closed'::core.reservation_status
  end;
$function$;
