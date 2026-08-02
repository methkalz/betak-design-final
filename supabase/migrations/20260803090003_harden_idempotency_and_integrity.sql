-- ============================================================================
-- بيتك ديزاين — 0027 — تقسية idempotency وسلامة محاسبة الحركات
-- استجابة لمراجعة كود كشفت ثلاث فجوات لم تلتقطها الاختبارات الخضراء:
--
-- 1) البصمة القانونية (canonical payload) لم تشمل السبب والملاحظات.
--    نفس المفتاح + نفس الكمية + سبب مختلف كان يُعامل كإعادة مطابقة فتُعاد
--    النتيجة القديمة — والصواب رفضه BD400. البصمة الآن تشمل كل مدخل يؤثر
--    فيما يُكتب. (شكل البصمة v2: عمليات ما قبل هذا الترحيل المخزنة بالشكل
--    القديم سترفض إعادة تشغيلها بمدخلات v2 — مقبول قبل الإطلاق، لا عملاء.)
--
-- 2) فحص lock_version وحالة المشروع كانا قبل فحص الـidempotency.
--    طلب نجح وضاع ردّه ثم تغيّر إصدار المشروع → إعادة الإرسال كانت ترجع
--    BD409 بدل النتيجة المخزنة. القاعدة الجديدة الملزمة:
--        بصمة كاملة ← فحص idempotency ← إعادة النتيجة إن طابقت
--        ← فحوص الحالة والإصدار للعمليات الجديدة فقط
--    (فحوص الهوية والعضوية والدور تبقى قبل كل شيء — أمن لا حالة.)
--
-- 3) movement_effects كان «مرجعًا بالاتفاق» لا بالقيد: قيمة enum جديدة بلا
--    صف فيه كانت ستُسقط حركاتها من الأرصدة صامتةً (inner join). الآن FK
--    يجعل الإدراج نفسه يفشل بصوت عالٍ.
--
-- إضافة: دلالة fabric_usage.planned_m صُححت — كانت «المتبقي قبل العملية»
-- فيتضخم المجموع مع الاستهلاك الجزئي المتكرر (حجز 20: استهلاك 8 ثم 12 كان
-- يسجل planned = 20 + 12 = 32). الدلالة الآن لكل حدث:
--     planned_m = الجزء المغطى بالحجز · actual_m = الكمية كلها · waste_m = الزيادة
-- فيصح: actual = planned + waste لكل صف، و Σplanned ≤ quantity_m.
-- ============================================================================

-- ── 3) تكامل movement_effects مفروض على المحرّك ─────────────────────────────
alter table core.stock_movements
  add constraint stock_movements_type_effects_fk
  foreign key (type) references core.movement_effects (type);

comment on constraint stock_movements_type_effects_fk on core.stock_movements is
  'قيمة enum جديدة بلا صف في movement_effects ترفض الإدراج بدل إسقاط الحركة '
  'صامتة من حسابات الأرصدة.';

comment on table core.movement_effects is
  'المصدر الوحيد لأثر كل نوع حركة. مفروض بقيد FK من stock_movements.type — '
  'إضافة قيمة enum توجب صفًا هنا أولًا وإلا فشل الإدراج.';

-- ── دلالة planned_m الجديدة ─────────────────────────────────────────────────
comment on column core.fabric_usage.planned_m is
  'لكل حدث استهلاك: الجزء المغطى بالحجز (لا «المتبقي قبل العملية»). '
  'actual_m = planned_m + waste_m لكل صف، و Σ(planned_m) ≤ quantity_m للحجز.';

-- ════════════════════════════════════════════════════════════════════════════
-- الدوال الثلاث — بصمة كاملة + إعادة الترتيب
-- ════════════════════════════════════════════════════════════════════════════

create or replace function api.reserve_fabric(
  p_project_id     uuid,
  p_roll_id        uuid,
  p_quantity_m     numeric,
  p_idempotency_key uuid,
  p_expected_project_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
end $$;

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

  -- البصمة تشمل السبب: نفس المفتاح بسبب مختلف = عملية مختلفة → BD400
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

  -- فحص الإصدار — للعمليات الجديدة فقط، بعد احتمال الإعادة
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

  if v_res.status = 'released' then
    raise exception 'الحجز محرَّر — لا يمكن الاستهلاك منه.' using errcode = 'BD409';
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

  update core.fabric_reservations
     set consumed_m = pg_catalog.round(consumed_m + v_from_res, 3),
         status = case
           when pg_catalog.round(consumed_m + v_from_res + released_m + damaged_reserved_m, 3)
                >= quantity_m then 'consumed'
           when pg_catalog.round(consumed_m + v_from_res, 3) > 0 then 'partially_consumed'
           else status end
   where id = p_reservation_id;

  -- دلالة الحدث: planned = الجزء المغطى بالحجز، فيصح actual = planned + waste
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

  -- البصمة تشمل السبب والملاحظات
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

  if v_res.status = 'released' then
    raise exception 'الحجز محرَّر بالكامل مسبقًا — لا يُعاد فتحه.'
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

  v_new_status := case
    when v_qty >= v_remaining
         and v_res.consumed_m = 0 and v_res.damaged_reserved_m = 0 then 'released'
    when v_qty >= v_remaining then 'consumed'
    else v_res.status end;

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
