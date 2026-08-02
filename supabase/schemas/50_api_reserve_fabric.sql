-- ════════════════════════════════════════════════════════════════════
-- api.reserve_fabric
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.reserve_fabric(p_project_id uuid, p_roll_id uuid, p_quantity_m numeric, p_idempotency_key uuid, p_expected_project_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_status text; v_lock_ver integer;
  v_qty numeric(12,3); v_payload jsonb; v_prior core.client_operations%rowtype;
  v_bal record; v_res_id uuid; v_roll_code text; v_result jsonb;
begin
  -- أمن وهوية — قبل كل شيء، بما فيه إعادة التشغيل
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;

  v_qty := pg_catalog.round(p_quantity_m, 3);
  if v_qty is null or v_qty <= 0 then
    raise exception 'الكمية يجب أن تكون أكبر من صفر.' using errcode = 'BD400';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  select p.organization_id, p.status_code, p.lock_version
    into v_org, v_status, v_lock_ver
  from core.projects p
  where p.id = p_project_id and p.archived_at is null;
  if v_org is null then
    raise exception 'المشروع غير موجود.' using errcode = 'BD404';
  end if;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في مؤسسة هذا المشروع.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales']::core.app_role[]) then
    raise exception 'دورك لا يسمح بحجز القماش.' using errcode = 'BD403';
  end if;

  select r.code into v_roll_code
  from core.fabric_rolls r
  where r.id = p_roll_id and r.organization_id = v_org and r.retired_at is null;
  if v_roll_code is null then
    raise exception 'الرول غير موجود في هذه المؤسسة.' using errcode = 'BD404';
  end if;

  -- البصمة الكاملة ثم الـidempotency — قبل فحوص الحالة والإصدار.
  -- p_expected_project_version ليس جزءًا من هوية العملية (شرط تزامن لا مدخل).
  v_payload := jsonb_build_object(
    'op', 'reserve_fabric', 'user_id', v_uid, 'project_id', p_project_id,
    'roll_id', p_roll_id, 'quantity_m', v_qty);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة. استخدم مفتاحًا جديدًا.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- فحوص الحالة — للعمليات الجديدة فقط
  if v_status not in ('customer_approved', 'fabric_allocated', 'with_tailor') then
    raise exception 'لا يمكن الحجز والمشروع في حالة "%". يلزم اعتماد الزبون أولًا.',
      v_status using errcode = 'BD409';
  end if;
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
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
    raise exception 'الكمية المطلوبة (% م) أكبر من المتاح (% م) في الرول %.',
      v_qty, v_bal.available_m, v_roll_code using errcode = 'BD422';
  end if;

  insert into core.fabric_reservations
    (organization_id, project_id, roll_id, quantity_m, created_by)
  values (v_org, p_project_id, p_roll_id, v_qty, v_uid)
  returning id into v_res_id;

  insert into core.stock_movements
    (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
     reason, created_by, idempotency_key)
  values (v_org, p_roll_id, 'reservation', v_qty, p_project_id, v_res_id,
          '', v_uid, p_idempotency_key);

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'inventory.reserve', 'fabric_reservation', v_res_id::text,
          format('حجز %s م من الرول %s', v_qty, v_roll_code), v_payload);

  if v_status = 'customer_approved' then
    perform set_config('app.rpc_context', 'on', true);
    update core.projects set status_code = 'fabric_allocated' where id = p_project_id;
    perform set_config('app.rpc_context', '', true);
  end if;

  select * into v_bal from private.roll_balance(p_roll_id);

  v_result := jsonb_build_object(
    'reservation_id',            v_res_id,
    'project_id',                p_project_id,
    'roll_id',                   p_roll_id,
    'roll_code',                 v_roll_code,
    'reserved_quantity_m',       v_qty,
    'on_hand_quantity_m',        v_bal.on_hand_m,
    'total_reserved_quantity_m', v_bal.reserved_m,
    'available_quantity_m',      v_bal.available_m,
    'was_replayed',              false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'reserve_fabric', v_res_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;
