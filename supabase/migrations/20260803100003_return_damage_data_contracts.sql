-- ============================================================================
-- بيتك ديزاين — 0031 — عقود البيانات للإرجاع والتلف (قبل أي RPC)
-- تنفيذ شروط الطاقم الخمسة: عقد البيانات، آلة الحالة، لا roll_id من العميل
-- (يُفرض بنيويًا هنا)، والصلاحيات والبصمات موثقة في DECISIONS §9.
--
-- المبدأ: كل ما استطعنا نقله من «انضباط RPC» إلى «قيد محرك» نُقل الآن،
-- قبل كتابة سطر واحد من الدالتين.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1) damage_reserved في المرجع المركزي وقيود السلامة
-- ════════════════════════════════════════════════════════════════════════════

insert into core.movement_effects (type, on_hand_sign, reserved_sign, label_ar)
values ('damage_reserved', -1, -1, 'تلف من المحجوز');

-- التلف المحجوز يحتاج سببًا وحجزًا — كالاستهلاك والزيادة
alter table core.stock_movements drop constraint reason_required_for_exceptions;
alter table core.stock_movements add constraint reason_required_for_exceptions
  check (
    type not in ('damage', 'damage_reserved', 'adjustment_in', 'adjustment_out',
                 'overconsumption')
    or length(btrim(reason)) > 0
  );

alter table core.stock_movements drop constraint reservation_required;
alter table core.stock_movements add constraint reservation_required
  check (
    type not in ('reservation', 'reservation_release', 'consumption',
                 'overconsumption', 'damage_reserved')
    or reservation_id is not null
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 2) ربط الإرجاع بسجل الاستهلاك — مفروض على المحرّك لا في الـRPC
--
-- FK ثنائي (org, usage) كان يمنع العبور بين المؤسسات لكنه يسمح بالإرجاع إلى
-- رول مختلف داخل المؤسسة نفسها. الحل: فهرس فريد خماسي على fabric_usage
-- و FK خماسي من دفتر الحركة إليه — فيفرض المحرّك تطابق الرول والحجز والمشروع
-- مع سجل الاستهلاك حرفيًا. (MATCH SIMPLE: الصفوف التي fabric_usage_id فيها
-- NULL — كل الحركات غير المرتبطة — لا يمسها القيد.)
-- ════════════════════════════════════════════════════════════════════════════

alter table core.stock_movements add column fabric_usage_id uuid;

comment on column core.stock_movements.fabric_usage_id is
  'حركات return فقط حاليًا: سجل الاستهلاك الذي يُرجَع منه. الـFK الخماسي '
  'يفرض تطابق المؤسسة والرول والحجز والمشروع مع السجل — لا يُقبل roll_id '
  'من العميل عند الإرجاع بل يُشتق كله من هذا السجل.';

create unique index fabric_usage_return_target_uidx
  on core.fabric_usage (organization_id, id, roll_id, reservation_id, project_id);

alter table core.stock_movements
  add constraint stock_movements_usage_consistency_fk
  foreign key (organization_id, fabric_usage_id, roll_id, reservation_id, project_id)
  references core.fabric_usage
    (organization_id, id, roll_id, reservation_id, project_id);

comment on constraint stock_movements_usage_consistency_fk on core.stock_movements is
  'إرجاع إلى رول أو حجز أو مشروع غير الذي استُهلك منه = خطأ FK من المحرّك، '
  'حتى من الأدوار مرتفعة الصلاحية.';

-- حركة return لا تُكتب بلا سجل استهلاك — الإرجاع الحر منفذ لتضخيم المخزون
alter table core.stock_movements add constraint return_requires_usage
  check (type <> 'return' or fabric_usage_id is not null);

-- حساب «المرتجع سابقًا» لكل سجل استهلااك بسرعة، تحت قفل السجل
create index stock_movements_usage_returns_idx
  on core.stock_movements (fabric_usage_id)
  where type = 'return';

-- ════════════════════════════════════════════════════════════════════════════
-- 3) آلة حالة الحجز — دالة مركزية واحدة، لا CASE مكرر في الدوال
--
--   remaining > 0:  consumed > 0 → partially_consumed، وإلا active
--   remaining = 0:  consumed = quantity → consumed   (نقي)
--                   released = quantity → released   (نقي)
--                   غير ذلك            → closed      (مختلط أو فيه تلف)
-- ════════════════════════════════════════════════════════════════════════════

create or replace function private.reservation_status_for(
  p_quantity numeric,
  p_consumed numeric,
  p_released numeric,
  p_damaged  numeric
)
returns core.reservation_status
language sql
immutable
set search_path = ''
as $$
  select case
    when pg_catalog.round(p_quantity - p_consumed - p_released - p_damaged, 3) > 0 then
      case when p_consumed > 0 then 'partially_consumed'::core.reservation_status
           else 'active'::core.reservation_status end
    when p_consumed = p_quantity then 'consumed'::core.reservation_status
    when p_released = p_quantity then 'released'::core.reservation_status
    else 'closed'::core.reservation_status
  end;
$$;

comment on function private.reservation_status_for(numeric, numeric, numeric, numeric) is
  'المصدر الوحيد لحالة الحجز. closed = انتهى بمزيج نتائج أو بتلف — الحالة '
  'لا تسمي التلف استهلاكًا ولا تحريرًا، كما لا يفعل الدفتر.';

grant execute on function private.reservation_status_for(numeric, numeric, numeric, numeric)
  to authenticated, baytak_rpc_owner;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) الدالتان القائمتان تعتمدان الآلة المركزية
--    (التغيير الوحيد في كل جسم: سطر تحديد الحالة + إبقاء released_at عند أي
--    انتقال لحالة نهائية. postgres عضو المالك و OR REPLACE يحفظ الملكية.)
-- ════════════════════════════════════════════════════════════════════════════

create or replace function api.consume_fabric(
  p_reservation_id  uuid,
  p_quantity_m      numeric,
  p_idempotency_key uuid,
  p_reason          text    default null,
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
  v_qty numeric(12,3); v_remaining numeric(12,3);
  v_from_res numeric(12,3); v_over numeric(12,3);
  v_bal record; v_group uuid;
  v_payload jsonb; v_prior core.client_operations%rowtype;
  v_usage_id uuid; v_notified boolean := false; v_result jsonb;
begin
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

  select * into v_res from core.fabric_reservations where id = p_reservation_id;
  if not found then
    raise exception 'الحجز غير موجود.' using errcode = 'BD404';
  end if;
  v_org := v_res.organization_id; v_project := v_res.project_id; v_roll := v_res.roll_id;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;

  select p.lock_version, p.tailor_id into v_lock_ver, v_tailor
  from core.projects p where p.id = v_project;

  if not (private.has_role(v_org, array['admin']::core.app_role[])
          or (private.has_role(v_org, array['tailor']::core.app_role[])
              and v_tailor = v_uid)) then
    raise exception 'الاستهلاك يسجّله الأدمن أو الخياط المسند لهذا المشروع.'
      using errcode = 'BD403';
  end if;

  v_payload := jsonb_build_object(
    'op', 'consume_fabric', 'user_id', v_uid,
    'reservation_id', p_reservation_id, 'quantity_m', v_qty,
    'reason', coalesce(p_reason, ''));

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  select r.code into v_roll_code from core.fabric_rolls r where r.id = v_roll for update;
  select * into v_res from core.fabric_reservations where id = p_reservation_id for update;

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
    raise exception 'الحجز % — لا يمكن الاستهلاك منه.',
      case v_res.status when 'released' then 'محرَّر' else 'مغلق' end
      using errcode = 'BD409';
  end if;

  v_remaining := private.reservation_remaining(p_reservation_id);
  v_from_res  := least(v_qty, greatest(0, v_remaining));
  v_over      := pg_catalog.round(v_qty - v_from_res, 3);

  select * into v_bal from private.roll_balance(v_roll);

  if v_qty > v_bal.on_hand_m then
    raise exception 'الاستهلاك (% م) أكبر من الموجود فعليًا (% م) في الرول %.',
      v_qty, v_bal.on_hand_m, v_roll_code using errcode = 'BD422';
  end if;

  if v_over > 0 then
    if p_reason is null or btrim(p_reason) = '' then
      raise exception 'الاستهلاك يتجاوز المحجوز بـ% م — السبب إلزامي.', v_over
        using errcode = 'BD400';
    end if;
    if v_over > v_bal.available_m then
      raise exception 'الزيادة (% م) أكبر من المتاح غير المحجوز (% م).',
        v_over, v_bal.available_m using errcode = 'BD422';
    end if;
  end if;

  v_group := gen_random_uuid();

  if v_from_res > 0 then
    insert into core.stock_movements
      (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
       reason, created_by, idempotency_key, operation_group_id)
    values (v_org, v_roll, 'consumption', v_from_res, v_project, p_reservation_id,
            coalesce(p_reason,''), v_uid, p_idempotency_key, v_group);
  end if;

  if v_over > 0 then
    insert into core.stock_movements
      (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
       reason, created_by, idempotency_key, operation_group_id)
    values (v_org, v_roll, 'overconsumption', v_over, v_project, p_reservation_id,
            'زيادة عن المحجوز: ' || p_reason, v_uid, gen_random_uuid(), v_group);
  end if;

  -- الحالة من الآلة المركزية
  update core.fabric_reservations
     set consumed_m = pg_catalog.round(consumed_m + v_from_res, 3),
         status = private.reservation_status_for(
           quantity_m,
           pg_catalog.round(consumed_m + v_from_res, 3),
           released_m,
           damaged_reserved_m)
   where id = p_reservation_id;

  insert into core.fabric_usage
    (organization_id, project_id, reservation_id, roll_id,
     planned_m, actual_m, waste_m, reason, created_by)
  values (v_org, v_project, p_reservation_id, v_roll,
          v_from_res, v_qty, v_over, coalesce(p_reason,''), v_uid)
  returning id into v_usage_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'inventory.consume', 'fabric_usage', v_usage_id::text,
          format('استهلاك %s م من الرول %s%s', v_qty, v_roll_code,
            case when v_over > 0 then format(' (زيادة %s م)', v_over) else '' end),
          v_payload || jsonb_build_object('operation_group_id', v_group));

  if v_over > 0 then
    insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
    select v_org, om.user_id, 'low_stock', 'استهلاك يتجاوز المخطط',
           format('الرول %s: استهلاك %s م بزيادة %s م. السبب: %s',
                  v_roll_code, v_qty, v_over, p_reason),
           'baytakdesign://projects/' || v_project::text
    from core.organization_members om
    where om.organization_id = v_org and om.role = 'admin' and om.is_active;
    v_notified := true;
  end if;

  select * into v_bal from private.roll_balance(v_roll);

  v_result := jsonb_build_object(
    'usage_id', v_usage_id,
    'reservation_id', p_reservation_id,
    'roll_id', v_roll,
    'roll_code', v_roll_code,
    'operation_group_id', v_group,
    'consumed_quantity_m', v_qty,
    'consumed_from_reservation_m', v_from_res,
    'overconsumed_quantity_m', v_over,
    'reserved_initial_m', v_res.quantity_m,
    'released_total_m', v_res.released_m,
    'damaged_total_m', v_res.damaged_reserved_m,
    'remaining_reserved_quantity_m', greatest(0, pg_catalog.round(v_remaining - v_from_res, 3)),
    'on_hand_quantity_m', v_bal.on_hand_m,
    'reserved_quantity_m', v_bal.reserved_m,
    'available_quantity_m', v_bal.available_m,
    'admin_notification_created', v_notified,
    'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'consume_fabric', v_usage_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $$;

create or replace function api.release_reservation(
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
  v_res core.fabric_reservations%rowtype; v_lock_ver integer;
  v_qty numeric(12,3); v_remaining numeric(12,3); v_bal record;
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
  if p_reason_code is null or btrim(p_reason_code) = '' then
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

  v_payload := jsonb_build_object(
    'op', 'release_reservation', 'user_id', v_uid,
    'reservation_id', p_reservation_id, 'quantity_m', v_qty,
    'reason_code', p_reason_code, 'notes', coalesce(p_notes, ''));

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  select r.code into v_roll_code from core.fabric_rolls r where r.id = v_roll for update;
  select * into v_res from core.fabric_reservations where id = p_reservation_id for update;

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
    raise exception 'الحجز % مسبقًا — لا يُعاد فتحه.',
      case v_res.status when 'released' then 'محرَّر بالكامل' else 'مغلق' end
      using errcode = 'BD409';
  end if;

  v_remaining := private.reservation_remaining(p_reservation_id);
  if v_qty > v_remaining then
    raise exception 'التحرير (% م) أكبر من المتبقي في الحجز (% م). المستهلك لا يُحرَّر.',
      v_qty, v_remaining using errcode = 'BD422';
  end if;

  insert into core.stock_movements
    (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
     reason, created_by, idempotency_key)
  values (v_org, v_roll, 'reservation_release', v_qty, v_project, p_reservation_id,
          p_reason_code || coalesce(' — ' || p_notes, ''), v_uid, p_idempotency_key);

  -- الحالة من الآلة المركزية
  v_new_status := private.reservation_status_for(
    v_res.quantity_m,
    v_res.consumed_m,
    pg_catalog.round(v_res.released_m + v_qty, 3),
    v_res.damaged_reserved_m);

  update core.fabric_reservations
     set released_m  = pg_catalog.round(released_m + v_qty, 3),
         status      = v_new_status,
         released_at = case when v_new_status <> v_res.status then now()
                            else released_at end
   where id = p_reservation_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'inventory.release', 'fabric_reservation',
          p_reservation_id::text,
          format('تحرير %s م من الرول %s — %s', v_qty, v_roll_code, p_reason_code),
          v_payload);

  select * into v_bal from private.roll_balance(v_roll);

  v_result := jsonb_build_object(
    'reservation_id', p_reservation_id,
    'roll_id', v_roll,
    'roll_code', v_roll_code,
    'released_quantity_m', v_qty,
    'reservation_status', v_new_status,
    'reserved_initial_m', v_res.quantity_m,
    'consumed_total_m', v_res.consumed_m,
    'released_total_m', pg_catalog.round(v_res.released_m + v_qty, 3),
    'damaged_total_m', v_res.damaged_reserved_m,
    'remaining_reserved_quantity_m', pg_catalog.round(v_remaining - v_qty, 3),
    'on_hand_quantity_m', v_bal.on_hand_m,
    'reserved_quantity_m', v_bal.reserved_m,
    'available_quantity_m', v_bal.available_m,
    'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'release_reservation', p_reservation_id::text, 'synced', v_payload, v_result,
          now());

  return v_result;
end $$;

notify pgrst, 'reload schema';
