-- ════════════════════════════════════════════════════════════════════
-- api.release_reservation
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.release_reservation(p_reservation_id uuid, p_quantity_m numeric, p_reason_code text, p_idempotency_key uuid, p_notes text DEFAULT NULL::text, p_expected_project_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_project uuid; v_roll uuid; v_roll_code text;
  v_res core.fabric_reservations%rowtype; v_lock_ver integer;
  v_qty numeric(12,3); v_remaining numeric(12,3);
  v_on_hand numeric(12,3); v_reserved numeric(12,3);
  v_payload jsonb; v_prior core.client_operations%rowtype;
  v_new_status core.reservation_status; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;

  v_qty := pg_catalog.round(p_quantity_m, 3);
  if v_qty is null or v_qty <= 0 then
    raise exception 'الكمية يجب أن تكون أكبر من صفر.' using errcode = 'BD400';
  end if;
  if p_reason_code is null or pg_catalog.btrim(p_reason_code) = '' then
    raise exception 'سبب التحرير إلزامي.' using errcode = 'BD400';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  select * into v_res from core.fabric_reservations where id = p_reservation_id;
  if not found then
    raise exception 'الحجز غير موجود.' using errcode = 'BD404';
  end if;
  v_org := v_res.organization_id; v_project := v_res.project_id; v_roll := v_res.roll_id;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales']::core.app_role[]) then
    raise exception 'دورك لا يسمح بتحرير الحجز.' using errcode = 'BD403';
  end if;

  select p.lock_version into v_lock_ver from core.projects p where p.id = v_project;
  if p_expected_project_version is not null and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.' using errcode = 'BD409';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'op','release_reservation','user_id',v_uid,
    'reservation_id',p_reservation_id,'quantity_m',v_qty);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.' using errcode='BD400';
    end if;
    return v_prior.result || pg_catalog.jsonb_build_object('was_replayed', true);
  end if;

  -- الأقفال بالترتيب الثابت: roll ← reservation
  select r.code into v_roll_code from core.fabric_rolls r where r.id = v_roll for update;
  select * into v_res from core.fabric_reservations where id = p_reservation_id for update;

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.' using errcode='BD400';
    end if;
    return v_prior.result || pg_catalog.jsonb_build_object('was_replayed', true);
  end if;

  if v_res.status = 'released' then
    raise exception 'الحجز محرَّر بالكامل مسبقًا — لا يُعاد فتحه.' using errcode = 'BD409';
  end if;

  -- المتبقي = الأصلي − المستهلك − المحرَّر. المستهلك لا يُحرَّر.
  v_remaining := pg_catalog.round(v_res.quantity_m - v_res.consumed_m - v_res.released_m, 3);
  if v_qty > v_remaining then
    raise exception 'التحرير (% م) أكبر من المتبقي في الحجز (% م). المستهلك لا يُحرَّر.',
      v_qty, v_remaining using errcode = 'BD422';
  end if;

  insert into core.stock_movements
    (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
     reason, created_by, idempotency_key)
  values (v_org, v_roll, 'reservation_release', v_qty, v_project, p_reservation_id,
          p_reason_code || coalesce(' — ' || p_notes, ''), v_uid, p_idempotency_key);

  -- استُنفد الحجز؟ 'released' إن لم يُستهلك منه شيء، وإلا 'consumed'.
  v_new_status := case
    when v_qty >= v_remaining and v_res.consumed_m = 0 then 'released'
    when v_qty >= v_remaining then 'consumed'
    else v_res.status end;

  update core.fabric_reservations
     set released_m  = pg_catalog.round(released_m + v_qty, 3),   -- quantity_m لا تُمس
         status      = v_new_status,
         released_at = case when v_new_status <> v_res.status then pg_catalog.now()
                            else released_at end
   where id = p_reservation_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'inventory.release', 'fabric_reservation', p_reservation_id::text,
          pg_catalog.format('تحرير %s م من الرول %s — %s', v_qty, v_roll_code, p_reason_code),
          v_payload);

  select
    pg_catalog.round(coalesce(sum(case
      when m.type in ('receipt','return','adjustment_in','transfer_in')       then  m.quantity_m
      when m.type in ('consumption','damage','adjustment_out','transfer_out') then -m.quantity_m
      else 0 end), 0), 3),
    greatest(0, pg_catalog.round(coalesce(sum(case
      when m.type = 'reservation'         then  m.quantity_m
      when m.type = 'reservation_release' then -m.quantity_m
      when m.type = 'consumption'         then -m.quantity_m
      else 0 end), 0), 3))
  into v_on_hand, v_reserved
  from core.stock_movements m where m.roll_id = v_roll;

  v_result := pg_catalog.jsonb_build_object(
    'reservation_id', p_reservation_id, 'roll_id', v_roll, 'roll_code', v_roll_code,
    'released_quantity_m', v_qty, 'reservation_status', v_new_status,
    'reserved_initial_m', v_res.quantity_m,
    'consumed_total_m', v_res.consumed_m,
    'released_total_m', pg_catalog.round(v_res.released_m + v_qty, 3),
    'remaining_reserved_quantity_m', pg_catalog.round(v_remaining - v_qty, 3),
    'on_hand_quantity_m', v_on_hand, 'reserved_quantity_m', v_reserved,
    'available_quantity_m', greatest(0, pg_catalog.round(v_on_hand - v_reserved, 3)),
    'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'release_reservation', p_reservation_id::text, 'synced', v_payload, v_result,
          pg_catalog.now());

  return v_result;
end $function$;
