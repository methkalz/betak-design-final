-- ============================================================================
-- بيتك ديزاين — 0034 — دوال الإرجاع والتلف الثلاث
-- على عقود DECISIONS §9 المجمَّدة، وبقرار صاحب المشروع النهائي:
--   الإرجاع وتلف المخزون: admin فقط (sales لا يستلم القماش فعليًا).
--   تلف المحجوز: admin أو الخياط المسند — بإعادة تحقق بعد قفل المشروع.
-- ============================================================================

grant create on schema api to baytak_rpc_owner;

-- ════════════════════════════════════════════════════════════════════════════
-- api.return_consumed_fabric — إرجاع قماش سبق تسجيله مستهلكًا
--   on_hand ↑ · reserved ثابت · available ↑
--   لا يخفض consumed_m ولا يعيد فتح الحجز — من يحتاج الكمية يحجز من جديد.
--   السقف الصارم: الإرجاع ≤ actual_m − Σ المرتجع سابقًا، تحت قفل سجل الاستخدام.
--   لا roll_id من العميل: كل السياق يُشتق من سجل الاستهلاك، والـFK الخماسي
--   وقيد الشكل يجعلان أي انحراف مستحيلًا حتى لو أخطأت الدالة نفسها.
-- ════════════════════════════════════════════════════════════════════════════
create function api.return_consumed_fabric(
  p_fabric_usage_id uuid,
  p_quantity_m      numeric,
  p_reason_code     text,
  p_idempotency_key uuid,
  p_notes           text    default null,
  p_expected_project_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- api.record_reserved_damage — تلف من كمية محجوزة
--   on_hand ↓ · reserved ↓ · available ثابت · damaged_reserved_m ↑
--   admin أو الخياط المسند — **يُعاد التحقق من الإسناد بعد قفل المشروع**
--   فلا يسجّل خياط تلفًا على مشروع فُكّ إسناده عنه للتو.
-- ════════════════════════════════════════════════════════════════════════════
create function api.record_reserved_damage(
  p_reservation_id  uuid,
  p_quantity_m      numeric,
  p_reason_code     text,
  p_idempotency_key uuid,
  p_notes           text    default null,
  p_expected_project_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid; v_org uuid; v_project uuid; v_roll uuid; v_roll_code text;
  v_res core.fabric_reservations%rowtype; v_lock_ver integer; v_tailor uuid;
  v_is_admin boolean;
  v_qty numeric(12,3); v_code text; v_notes text;
  v_remaining numeric(12,3); v_bal record; v_mv_id uuid;
  v_new_status core.reservation_status;
  v_payload jsonb; v_prior core.client_operations%rowtype;
  v_notified boolean := false; v_result jsonb;
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

  select * into v_res from core.fabric_reservations where id = p_reservation_id;
  if not found then
    raise exception 'الحجز غير موجود.' using errcode = 'BD404';
  end if;
  v_org := v_res.organization_id; v_project := v_res.project_id; v_roll := v_res.roll_id;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;

  v_is_admin := private.has_role(v_org, array['admin']::core.app_role[]);
  select p.lock_version, p.tailor_id into v_lock_ver, v_tailor
  from core.projects p where p.id = v_project;

  if not (v_is_admin
          or (private.has_role(v_org, array['tailor']::core.app_role[])
              and v_tailor = v_uid)) then
    raise exception 'تلف المحجوز يسجّله الأدمن أو الخياط المسند لهذا المشروع.'
      using errcode = 'BD403';
  end if;

  v_payload := jsonb_build_object(
    'op', 'record_reserved_damage', 'user_id', v_uid,
    'reservation_id', p_reservation_id, 'quantity_m', v_qty,
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

  -- الأقفال بالترتيب الثابت: roll ← reservation ← project
  select r.code into v_roll_code from core.fabric_rolls r where r.id = v_roll for update;
  select * into v_res from core.fabric_reservations where id = p_reservation_id for update;
  select p.tailor_id into v_tailor from core.projects p where p.id = v_project for update;

  -- ★ إعادة التحقق بعد القفل (شرط المراجعة): الإسناد قد يكون تغيّر
  if not v_is_admin and v_tailor is distinct from v_uid then
    raise exception 'لم تعد الخياط المسند لهذا المشروع.' using errcode = 'BD403';
  end if;

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  if v_res.status in ('released', 'closed') then
    raise exception 'الحجز % — لا يُسجَّل تلف عليه.',
      case v_res.status when 'released' then 'محرَّر' else 'مغلق' end
      using errcode = 'BD409';
  end if;

  v_remaining := private.reservation_remaining(p_reservation_id);
  if v_qty > v_remaining then
    raise exception 'التلف (% م) أكبر من المتبقي في الحجز (% م).',
      v_qty, v_remaining using errcode = 'BD422';
  end if;

  insert into core.stock_movements
    (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
     reason_code, notes, created_by, idempotency_key)
  values (v_org, v_roll, 'damage_reserved', v_qty, v_project, p_reservation_id,
          v_code, v_notes, v_uid, p_idempotency_key)
  returning id into v_mv_id;

  v_new_status := private.reservation_status_for(
    v_res.quantity_m, v_res.consumed_m, v_res.released_m,
    pg_catalog.round(v_res.damaged_reserved_m + v_qty, 3));

  update core.fabric_reservations
     set damaged_reserved_m = pg_catalog.round(damaged_reserved_m + v_qty, 3),
         status = v_new_status,
         released_at = case when v_new_status <> v_res.status then now()
                            else released_at end
   where id = p_reservation_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'inventory.damage_reserved', 'fabric_reservation',
          p_reservation_id::text,
          format('تلف %s م من محجوز الرول %s — %s', v_qty, v_roll_code,
                 (select label_ar from core.movement_reasons where code = v_code)),
          v_payload);

  -- الخياط سجّل تلفًا → الأدمن يُشعَر (الأدمن لا يُشعِر نفسه)
  if not v_is_admin then
    insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
    select v_org, om.user_id, 'low_stock', 'تلف في قماش محجوز',
           format('الرول %s: تلف %s م. السبب: %s%s', v_roll_code, v_qty,
                  (select label_ar from core.movement_reasons where code = v_code),
                  case when v_notes <> '' then ' — ' || v_notes else '' end),
           'baytakdesign://projects/' || v_project::text
    from core.organization_members om
    where om.organization_id = v_org and om.role = 'admin' and om.is_active;
    v_notified := true;
  end if;

  select * into v_bal from private.roll_balance(v_roll);

  v_result := jsonb_build_object(
    'movement_id', v_mv_id,
    'reservation_id', p_reservation_id,
    'roll_id', v_roll,
    'roll_code', v_roll_code,
    'damaged_quantity_m', v_qty,
    'reservation_status', v_new_status,
    'reserved_initial_m', v_res.quantity_m,
    'consumed_total_m', v_res.consumed_m,
    'released_total_m', v_res.released_m,
    'damaged_total_m', pg_catalog.round(v_res.damaged_reserved_m + v_qty, 3),
    'remaining_reserved_quantity_m', pg_catalog.round(v_remaining - v_qty, 3),
    'on_hand_quantity_m', v_bal.on_hand_m,
    'reserved_quantity_m', v_bal.reserved_m,
    'available_quantity_m', v_bal.available_m,
    'admin_notification_created', v_notified,
    'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'record_reserved_damage', v_mv_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- api.record_stock_damage — تلف من المخزون المتاح (حدث مستودع، لا مشروع له)
--   on_hand ↓ · reserved ثابت · available ↓ · admin فقط
--   السقف: الكمية ≤ **المتاح** لا الموجود — وإلا أكل التلف غطاء المحجوز
--   وانكسر invariant الرول (reserved ≤ on_hand).
-- ════════════════════════════════════════════════════════════════════════════
create function api.record_stock_damage(
  p_roll_id         uuid,
  p_quantity_m      numeric,
  p_reason_code     text,
  p_idempotency_key uuid,
  p_notes           text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  if not exists (select 1 from core.movement_reasons where code = v_code and is_active) then
    raise exception 'رمز السبب "%" غير معتمد.', v_code using errcode = 'BD400';
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

  -- السقف المتاح لا الموجود: يحمي غطاء المحجوز و invariant الرول
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
end $$;

-- ── الملكية والصلاحيات ──────────────────────────────────────────────────────
alter function api.return_consumed_fabric(uuid, numeric, text, uuid, text, integer)
  owner to baytak_rpc_owner;
alter function api.record_reserved_damage(uuid, numeric, text, uuid, text, integer)
  owner to baytak_rpc_owner;
alter function api.record_stock_damage(uuid, numeric, text, uuid, text)
  owner to baytak_rpc_owner;

revoke all on function
  api.return_consumed_fabric(uuid, numeric, text, uuid, text, integer),
  api.record_reserved_damage(uuid, numeric, text, uuid, text, integer),
  api.record_stock_damage(uuid, numeric, text, uuid, text)
from public, anon;

grant execute on function
  api.return_consumed_fabric(uuid, numeric, text, uuid, text, integer),
  api.record_reserved_damage(uuid, numeric, text, uuid, text, integer),
  api.record_stock_damage(uuid, numeric, text, uuid, text)
to authenticated;

revoke create on schema api from baytak_rpc_owner;

notify pgrst, 'reload schema';
