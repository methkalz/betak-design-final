-- ============================================================================
-- بيتك ديزاين — 0021 — api.consume_fabric و api.release_reservation
--
-- ── الدلالات المحاسبية (مُثبَتة تجريبيًا قبل الكتابة) ────────────────────────
--
--   الاستهلاك من حجز قائم:   on_hand ↓   reserved ↓   available ثابت
--   الزيادة عن الحجز:        on_hand ↓   reserved ثابت   available ↓
--   تحرير الحجز:             on_hand ثابت   reserved ↓   available ↑
--
-- المتاح لا يتأثر بالاستهلاك المخطط لأن الكمية خرجت من دائرة البيع لحظة حجزها.
--
-- ── لماذا حركتان لا واحدة عند الزيادة ───────────────────────────────────────
-- صيغة reserved تُقصّ عند الصفر على مستوى **الرول** لا الحجز:
--     reserved = greatest(0, Σreservation − Σrelease − Σconsumption)
-- فلو سجّلنا استهلاك 7 من حجز رصيده 5 كحركة consumption واحدة، ولدى الرول
-- حجز آخر بـ10 م، لصار reserved = 15 − 7 = 8 بدل 10 — أي أن زيادة هذا المشروع
-- أكلت من حجز مشروع آخر. لذا:
--     الجزء المغطى بالحجز  → consumption      (يخفض on_hand و reserved)
--     الزيادة              → adjustment_out   (تخفض on_hand وحده، بسبب إلزامي)
-- والدلالة الكاملة «كم استهلك هذا المشروع فعلًا» تسكن في core.fabric_usage.
--
-- ── ترتيب الأقفال (ثابت في كل دوال المخزون لتفادي الـdeadlock) ──────────────
--     fabric_roll  →  fabric_reservation  →  project
-- ============================================================================

grant create on schema api to baytak_rpc_owner;

-- ════════════════════════════════════════════════════════════════════════════
-- api.consume_fabric
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
  v_uid        uuid;
  v_org        uuid;
  v_project    uuid;
  v_roll       uuid;
  v_roll_code  text;
  v_res        core.fabric_reservations%rowtype;
  v_status     text;
  v_lock_ver   integer;
  v_tailor     uuid;
  v_qty        numeric(12,3);
  v_remaining  numeric(12,3);
  v_from_res   numeric(12,3);
  v_over       numeric(12,3);
  v_on_hand    numeric(12,3);
  v_reserved   numeric(12,3);
  v_available  numeric(12,3);
  v_payload    jsonb;
  v_prior      core.client_operations%rowtype;
  v_usage_id   uuid;
  v_notified   boolean := false;
  v_result     jsonb;
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

  -- الحجز والسياق — المؤسسة تُشتق من الحجز لا من الجهاز
  select * into v_res from core.fabric_reservations where id = p_reservation_id;
  if not found then
    raise exception 'الحجز غير موجود.' using errcode = 'BD404';
  end if;
  v_org := v_res.organization_id;
  v_project := v_res.project_id;
  v_roll := v_res.roll_id;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;

  select p.status_code, p.lock_version, p.tailor_id
    into v_status, v_lock_ver, v_tailor
  from core.projects p where p.id = v_project;

  -- الأدمن، أو الخياط المسند لهذا المشروع تحديدًا
  if not (private.has_role(v_org, array['admin']::core.app_role[])
          or (private.has_role(v_org, array['tailor']::core.app_role[])
              and v_tailor = v_uid)) then
    raise exception 'الاستهلاك يسجّله الأدمن أو الخياط المسند لهذا المشروع.'
      using errcode = 'BD403';
  end if;

  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'op', 'consume_fabric', 'user_id', v_uid,
    'reservation_id', p_reservation_id, 'quantity_m', v_qty);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || pg_catalog.jsonb_build_object('was_replayed', true);
  end if;

  -- الأقفال بالترتيب الثابت: roll ← reservation
  select r.code into v_roll_code
  from core.fabric_rolls r where r.id = v_roll for update;
  select * into v_res from core.fabric_reservations where id = p_reservation_id for update;

  -- الفحص الثاني بعد القفل
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || pg_catalog.jsonb_build_object('was_replayed', true);
  end if;

  if v_res.status = 'released' then
    raise exception 'الحجز محرَّر — لا يمكن الاستهلاك منه.' using errcode = 'BD409';
  end if;

  v_remaining := pg_catalog.round(v_res.quantity_m - v_res.consumed_m, 3);
  v_from_res  := least(v_qty, greatest(0, v_remaining));
  v_over      := pg_catalog.round(v_qty - v_from_res, 3);

  -- الرصيد الحالي من الدفتر
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

  v_available := greatest(0, pg_catalog.round(v_on_hand - v_reserved, 3));

  -- الموجود الفعلي يجب أن يكفي الاستهلاك كله
  if v_qty > v_on_hand then
    raise exception 'الاستهلاك (% م) أكبر من الموجود فعليًا (% م) في الرول %.',
      v_qty, v_on_hand, v_roll_code using errcode = 'BD422';
  end if;

  -- الزيادة: سبب إلزامي، ويجب أن تجد كمية متاحة غير محجوزة لغيرها
  if v_over > 0 then
    if p_reason is null or pg_catalog.btrim(p_reason) = '' then
      raise exception 'الاستهلاك يتجاوز المحجوز بـ% م — السبب إلزامي.', v_over
        using errcode = 'BD400';
    end if;
    if v_over > v_available then
      raise exception 'الزيادة (% م) أكبر من المتاح غير المحجوز (% م).',
        v_over, v_available using errcode = 'BD422';
    end if;
  end if;

  -- الدفتر: حركتان منفصلتان (انظر رأس الملف)
  if v_from_res > 0 then
    insert into core.stock_movements
      (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
       reason, created_by, idempotency_key)
    values (v_org, v_roll, 'consumption', v_from_res, v_project, p_reservation_id,
            coalesce(p_reason,''), v_uid, p_idempotency_key);
  end if;

  if v_over > 0 then
    insert into core.stock_movements
      (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
       reason, created_by, idempotency_key)
    values (v_org, v_roll, 'adjustment_out', v_over, v_project, null,
            'زيادة عن المحجوز: ' || p_reason, v_uid,
            pg_catalog.gen_random_uuid());
  end if;

  -- تحديث الحجز
  update core.fabric_reservations
     set consumed_m = pg_catalog.round(consumed_m + v_from_res, 3),
         status = case
           when pg_catalog.round(consumed_m + v_from_res, 3) >= quantity_m then 'consumed'
           when pg_catalog.round(consumed_m + v_from_res, 3) > 0 then 'partially_consumed'
           else status end
   where id = p_reservation_id;

  -- سجل الاستهلاك: هنا تسكن الدلالة الكاملة planned مقابل actual
  insert into core.fabric_usage
    (organization_id, project_id, reservation_id, roll_id,
     planned_m, actual_m, waste_m, reason, created_by)
  values (v_org, v_project, p_reservation_id, v_roll,
          greatest(0, v_remaining), v_qty, v_over, coalesce(p_reason,''), v_uid)
  returning id into v_usage_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'inventory.consume', 'fabric_usage', v_usage_id::text,
          pg_catalog.format('استهلاك %s م من الرول %s%s', v_qty, v_roll_code,
            case when v_over > 0 then pg_catalog.format(' (زيادة %s م)', v_over) else '' end),
          v_payload);

  -- إشعار الأدمن عند التجاوز. صف الإشعار داخل المعاملة (بسيط ورخيص)؛
  -- أما إرسال Push فخارجها عبر طابور — فشل APNs/FCM لا يُلغي استهلاك قماش.
  if v_over > 0 then
    insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
    select v_org, om.user_id, 'low_stock',
           'استهلاك يتجاوز المخطط',
           pg_catalog.format('الرول %s: استهلاك %s م بزيادة %s م. السبب: %s',
                             v_roll_code, v_qty, v_over, p_reason),
           'baytakdesign://projects/' || v_project::text
    from core.organization_members om
    where om.organization_id = v_org and om.role = 'admin' and om.is_active;
    v_notified := true;
  end if;

  -- لقطة الرصيد بعد العملية
  v_on_hand   := pg_catalog.round(v_on_hand - v_qty, 3);
  v_reserved  := greatest(0, pg_catalog.round(v_reserved - v_from_res, 3));
  v_available := greatest(0, pg_catalog.round(v_on_hand - v_reserved, 3));

  v_result := pg_catalog.jsonb_build_object(
    'usage_id', v_usage_id,
    'reservation_id', p_reservation_id,
    'roll_id', v_roll,
    'roll_code', v_roll_code,
    'consumed_quantity_m', v_qty,
    'consumed_from_reservation_m', v_from_res,
    'overconsumed_quantity_m', v_over,
    'remaining_reserved_quantity_m', greatest(0, pg_catalog.round(v_remaining - v_from_res, 3)),
    'on_hand_quantity_m', v_on_hand,
    'reserved_quantity_m', v_reserved,
    'available_quantity_m', v_available,
    'admin_notification_created', v_notified,
    'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'consume_fabric', v_usage_id::text, 'synced', v_payload, v_result,
          pg_catalog.now());

  return v_result;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- api.release_reservation
-- ════════════════════════════════════════════════════════════════════════════
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
  v_uid       uuid;
  v_org       uuid;
  v_project   uuid;
  v_roll      uuid;
  v_roll_code text;
  v_res       core.fabric_reservations%rowtype;
  v_lock_ver  integer;
  v_qty       numeric(12,3);
  v_remaining numeric(12,3);
  v_on_hand   numeric(12,3);
  v_reserved  numeric(12,3);
  v_payload   jsonb;
  v_prior     core.client_operations%rowtype;
  v_new_status core.reservation_status;
  v_result    jsonb;
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
  v_org := v_res.organization_id;
  v_project := v_res.project_id;
  v_roll := v_res.roll_id;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales']::core.app_role[]) then
    raise exception 'دورك لا يسمح بتحرير الحجز.' using errcode = 'BD403';
  end if;

  select p.lock_version into v_lock_ver from core.projects p where p.id = v_project;
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'op', 'release_reservation', 'user_id', v_uid,
    'reservation_id', p_reservation_id, 'quantity_m', v_qty);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || pg_catalog.jsonb_build_object('was_replayed', true);
  end if;

  -- الأقفال بالترتيب الثابت
  select r.code into v_roll_code from core.fabric_rolls r where r.id = v_roll for update;
  select * into v_res from core.fabric_reservations where id = p_reservation_id for update;

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || pg_catalog.jsonb_build_object('was_replayed', true);
  end if;

  if v_res.status = 'released' then
    raise exception 'الحجز محرَّر بالكامل مسبقًا — لا يُعاد فتحه.'
      using errcode = 'BD409';
  end if;

  -- المتبقي = المحجوز ناقص المستهلك. المستهلك لا يُحرَّر.
  v_remaining := pg_catalog.round(v_res.quantity_m - v_res.consumed_m, 3);
  if v_qty > v_remaining then
    raise exception 'التحرير (% م) أكبر من المتبقي في الحجز (% م). المستهلك لا يُحرَّر.',
      v_qty, v_remaining using errcode = 'BD422';
  end if;

  insert into core.stock_movements
    (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
     reason, created_by, idempotency_key)
  values (v_org, v_roll, 'reservation_release', v_qty, v_project, p_reservation_id,
          p_reason_code || coalesce(' — ' || p_notes, ''), v_uid, p_idempotency_key);

  -- التحرير الكامل للمتبقي يغلق الحجز؛ الجزئي يبقيه مفتوحًا
  v_new_status := case
    when v_qty >= v_remaining and v_res.consumed_m = 0 then 'released'
    when v_qty >= v_remaining then 'consumed'
    else v_res.status end;

  update core.fabric_reservations
     set quantity_m  = pg_catalog.round(quantity_m - v_qty, 3),
         status      = v_new_status,
         released_at = case when v_new_status <> v_res.status then pg_catalog.now()
                            else released_at end
   where id = p_reservation_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'inventory.release', 'fabric_reservation',
          p_reservation_id::text,
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
    'reservation_id', p_reservation_id,
    'roll_id', v_roll,
    'roll_code', v_roll_code,
    'released_quantity_m', v_qty,
    'reservation_status', v_new_status,
    'remaining_reserved_quantity_m', pg_catalog.round(v_remaining - v_qty, 3),
    'on_hand_quantity_m', v_on_hand,
    'reserved_quantity_m', v_reserved,
    'available_quantity_m', greatest(0, pg_catalog.round(v_on_hand - v_reserved, 3)),
    'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'release_reservation', p_reservation_id::text, 'synced', v_payload, v_result,
          pg_catalog.now());

  return v_result;
end $$;

-- ── الملكية والصلاحيات ──────────────────────────────────────────────────────
alter function api.consume_fabric(uuid, numeric, uuid, text, integer)
  owner to baytak_rpc_owner;
alter function api.release_reservation(uuid, numeric, text, uuid, text, integer)
  owner to baytak_rpc_owner;

revoke all on function api.consume_fabric(uuid, numeric, uuid, text, integer)
  from public, anon;
revoke all on function api.release_reservation(uuid, numeric, text, uuid, text, integer)
  from public, anon;
grant execute on function api.consume_fabric(uuid, numeric, uuid, text, integer)
  to authenticated;
grant execute on function api.release_reservation(uuid, numeric, text, uuid, text, integer)
  to authenticated;

-- تُسحب CREATE فور انتهاء نقل الملكية (سياسة 0020)
revoke create on schema api from baytak_rpc_owner;

notify pgrst, 'reload schema';
