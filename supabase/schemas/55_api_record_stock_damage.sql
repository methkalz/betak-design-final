-- ════════════════════════════════════════════════════════════════════
-- api.record_stock_damage
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.record_stock_damage(p_roll_id uuid, p_quantity_m numeric, p_reason_code text, p_idempotency_key uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_roll_code text;
  v_qty numeric(12,3); v_code text; v_notes text;
  v_bal record; v_mv_id uuid;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;

  v_qty   := pg_catalog.round(p_quantity_m, 3);
  v_code  := nullif(pg_catalog.btrim(coalesce(p_reason_code, '')), '');
  v_notes := pg_catalog.btrim(coalesce(p_notes, ''));
  if v_qty is null or v_qty <= 0 then
    raise exception 'الكمية يجب أن تكون أكبر من صفر.' using errcode = 'BD400';
  end if;
  if v_code is null then
    raise exception 'رمز سبب التلف إلزامي.' using errcode = 'BD400';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  select r.organization_id, r.code into v_org, v_roll_code
  from core.fabric_rolls r where r.id = p_roll_id and r.retired_at is null;
  if v_org is null then
    raise exception 'الرول غير موجود.' using errcode = 'BD404';
  end if;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin']::core.app_role[]) then
    raise exception 'تلف المخزون العام صلاحية الأدمن وحده.' using errcode = 'BD403';
  end if;

  v_payload := jsonb_build_object(
    'op', 'record_stock_damage', 'user_id', v_uid,
    'roll_id', p_roll_id, 'quantity_m', v_qty,
    'reason_code', v_code, 'notes', v_notes);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  if not exists (
    select 1 from core.movement_reasons
    where code = v_code and is_active
      and 'damage'::core.movement_type = any (applies_to)
  ) then
    raise exception 'رمز السبب "%" غير معتمد لهذه العملية.', v_code
      using errcode = 'BD400';
  end if;

  perform 1 from core.fabric_rolls where id = p_roll_id for update;

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  select * into v_bal from private.roll_balance(p_roll_id);

  if v_qty > v_bal.available_m then
    raise exception 'التلف (% م) أكبر من المتاح غير المحجوز (% م) في الرول % — تلف الكمية المحجوزة يسجَّل عبر تلف المحجوز.',
      v_qty, v_bal.available_m, v_roll_code using errcode = 'BD422';
  end if;

  insert into core.stock_movements
    (organization_id, roll_id, type, quantity_m, reason_code, notes,
     created_by, idempotency_key)
  values (v_org, p_roll_id, 'damage', v_qty, v_code, v_notes,
          v_uid, p_idempotency_key)
  returning id into v_mv_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'inventory.damage', 'stock_movement', v_mv_id::text,
          format('تلف %s م من مخزون الرول %s — %s', v_qty, v_roll_code,
                 (select label_ar from core.movement_reasons where code = v_code)),
          v_payload);

  select * into v_bal from private.roll_balance(p_roll_id);

  v_result := jsonb_build_object(
    'movement_id', v_mv_id,
    'roll_id', p_roll_id,
    'roll_code', v_roll_code,
    'damaged_quantity_m', v_qty,
    'on_hand_quantity_m', v_bal.on_hand_m,
    'reserved_quantity_m', v_bal.reserved_m,
    'available_quantity_m', v_bal.available_m,
    'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'record_stock_damage', v_mv_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;
