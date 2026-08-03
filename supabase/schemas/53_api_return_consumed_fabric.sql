-- ════════════════════════════════════════════════════════════════════
-- api.return_consumed_fabric
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.return_consumed_fabric(p_fabric_usage_id uuid, p_quantity_m numeric, p_reason_code text, p_idempotency_key uuid, p_notes text DEFAULT NULL::text, p_expected_project_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_project uuid; v_roll uuid; v_reservation uuid;
  v_usage core.fabric_usage%rowtype; v_roll_code text; v_lock_ver integer;
  v_qty numeric(12,3); v_code text; v_notes text;
  v_prior_returns numeric(12,3); v_returnable numeric(12,3);
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
    raise exception 'رمز سبب الإرجاع إلزامي.' using errcode = 'BD400';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  -- كل السياق من سجل الاستهلاك — لا شيء من الجهاز
  select * into v_usage from core.fabric_usage where id = p_fabric_usage_id;
  if not found then
    raise exception 'سجل الاستهلاك غير موجود.' using errcode = 'BD404';
  end if;
  v_org := v_usage.organization_id; v_project := v_usage.project_id;
  v_roll := v_usage.roll_id;        v_reservation := v_usage.reservation_id;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  -- قرار صاحب المشروع: الإرجاع يزيد المخزون الفعلي → admin حصرًا في الـMVP
  if not private.has_role(v_org, array['admin']::core.app_role[]) then
    raise exception 'إرجاع القماش المستهلك صلاحية الأدمن وحده.' using errcode = 'BD403';
  end if;

  select p.lock_version into v_lock_ver from core.projects p where p.id = v_project;

  v_payload := jsonb_build_object(
    'op', 'return_consumed_fabric', 'user_id', v_uid,
    'fabric_usage_id', p_fabric_usage_id, 'quantity_m', v_qty,
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

  if not exists (select 1 from core.movement_reasons where code = v_code and is_active) then
    raise exception 'رمز السبب "%" غير معتمد.', v_code using errcode = 'BD400';
  end if;

  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  -- الأقفال: الرول ثم سجل الاستخدام (السقف يُحسب تحت هذا القفل)
  select r.code into v_roll_code from core.fabric_rolls r where r.id = v_roll for update;
  select * into v_usage from core.fabric_usage where id = p_fabric_usage_id for update;

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- السقف الصارم تحت القفل: المرتجع الجديد ≤ الفعلي − المرتجع سابقًا
  select pg_catalog.round(coalesce(sum(m.quantity_m), 0), 3) into v_prior_returns
  from core.stock_movements m
  where m.fabric_usage_id = p_fabric_usage_id and m.type = 'return';

  v_returnable := pg_catalog.round(v_usage.actual_m - v_prior_returns, 3);
  if v_qty > v_returnable then
    raise exception 'الإرجاع (% م) أكبر من القابل للإرجاع (% م = مستهلك % − مرتجع سابقًا %).',
      v_qty, v_returnable, v_usage.actual_m, v_prior_returns using errcode = 'BD422';
  end if;

  insert into core.stock_movements
    (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
     fabric_usage_id, reason_code, notes, created_by, idempotency_key)
  values (v_org, v_roll, 'return', v_qty, v_project, v_reservation,
          p_fabric_usage_id, v_code, v_notes, v_uid, p_idempotency_key)
  returning id into v_mv_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'inventory.return', 'stock_movement', v_mv_id::text,
          format('إرجاع %s م إلى الرول %s — %s', v_qty, v_roll_code,
                 (select label_ar from core.movement_reasons where code = v_code)),
          v_payload);

  select * into v_bal from private.roll_balance(v_roll);

  v_result := jsonb_build_object(
    'movement_id', v_mv_id,
    'fabric_usage_id', p_fabric_usage_id,
    'reservation_id', v_reservation,
    'roll_id', v_roll,
    'roll_code', v_roll_code,
    'returned_quantity_m', v_qty,
    'previously_returned_m', v_prior_returns,
    'remaining_returnable_m', pg_catalog.round(v_returnable - v_qty, 3),
    'on_hand_quantity_m', v_bal.on_hand_m,
    'reserved_quantity_m', v_bal.reserved_m,
    'available_quantity_m', v_bal.available_m,
    'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'return_consumed_fabric', v_mv_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;
