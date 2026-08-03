-- ============================================================================
-- بيتك ديزاين — 0036 — أختام الإنهاء الدلالية + ذرية فحص الإصدار + نطاقات الأسباب
-- استجابة لمانعَي الدمج وملاحظة التصميم من المراجعة. تحقق نصي قبل التنفيذ:
--   1) released_at كان يُختم عند أي تغيّر حالة — حتى closed بتلف كامل: نفس
--      الخطيئة الدلالية التي مُنعت في الدفتر عادت في الطابع الزمني.
--   2) expected_project_version كان يُفحص قبل قفل المشروع — نافذة سباق بين
--      القراءة والالتزام. أربع دوال بلا قفل مشروع إطلاقًا، والخامسة تقفل ولا
--      تعيد الفحص.
--   3) الرموز بلا نطاق: water_damage كان يمرّ لتحرير حجز.
--
-- القواعد الجديدة الملزمة:
--   • released_at = التحرير الكامل النقي فقط (status = released).
--     finalized_at = دخول أي حالة نهائية (consumed / released / closed).
--   • ترتيب الأقفال: fabric_roll ← fabric_reservation ← fabric_usage ← project
--     والمشروع **دائمًا الأخير**، وفحص الإصدار (والدور المسند) الحاسم يجري
--     **بعد** قفله — الفحص المبكر يبقى كإخفاق سريع فقط.
--   • كل رمز سبب له نطاق عمليات (applies_to)، مفروض في الدوال وبمحفّز على
--     الدفتر معًا — لا «بالاتفاق».
-- ============================================================================

-- ── 1) العمودان الدلاليان ───────────────────────────────────────────────────
alter table core.fabric_reservations add column finalized_at timestamptz;

comment on column core.fabric_reservations.released_at is
  'وقت التحرير الكامل النقي فقط (status = released). الإغلاق المختلط أو '
  'بالتلف لا يمسّه — انظر finalized_at.';
comment on column core.fabric_reservations.finalized_at is
  'وقت دخول أي حالة نهائية (consumed / released / closed). يُختم مرة واحدة.';

create or replace view api.fabric_reservations with (security_invoker = on) as
select
  res.id as reservation_id,
  res.organization_id,
  res.project_id,
  res.roll_id,
  r.code as roll_code,
  v.color_name,
  res.quantity_m,
  res.consumed_m,
  res.released_m,
  round(res.quantity_m - res.consumed_m - res.released_m - res.damaged_reserved_m, 3)
    as outstanding_m,
  res.status,
  res.created_by,
  res.created_at,
  res.released_at,
  res.damaged_reserved_m,
  res.finalized_at
from core.fabric_reservations res
join core.fabric_rolls r    on r.id = res.roll_id
join core.fabric_variants v on v.id = r.variant_id;

grant select on api.fabric_reservations to authenticated;

-- ── 2) نطاقات الأسباب ───────────────────────────────────────────────────────
alter table core.movement_reasons
  add column applies_to core.movement_type[] not null default '{}';

update core.movement_reasons set applies_to = v.a::core.movement_type[]
from (values
  ('cutting_error',     '{overconsumption,damage_reserved}'),
  ('sewing_error',      '{overconsumption,damage_reserved}'),
  ('pattern_matching',  '{overconsumption}'),
  ('design_change',     '{reservation_release}'),
  ('customer_change',   '{reservation_release}'),
  ('project_cancelled', '{reservation_release}'),
  ('over_reserved',     '{reservation_release}'),
  ('leftover_return',   '{return}'),
  ('quality_defect',    '{damage,damage_reserved}'),
  ('water_damage',      '{damage,damage_reserved}'),
  ('storage_damage',    '{damage,damage_reserved}'),
  ('other',             '{overconsumption,reservation_release,return,damage,damage_reserved,adjustment_in,adjustment_out}')
) as v(code, a)
where movement_reasons.code = v.code;

alter table core.movement_reasons
  add constraint reasons_have_scope check (cardinality(applies_to) > 0);

-- تصحيح تعليق غير دقيق أمسكته المراجعة: الـFK يفرض الوجود فقط؛ الفاعلية
-- والنطاق يفرضهما المحفّز أدناه والدوال.
comment on table core.movement_reasons is
  'الأسباب المعتمدة لحركات المخزون. الوجود يفرضه FK من stock_movements؛ '
  'الفاعلية (is_active) والنطاق (applies_to) يفرضهما محفّز '
  'enforce_reason_scope على الدفتر + فحص الدوال — على المحرّك لا بالاتفاق.';

create or replace function private.enforce_reason_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from core.movement_reasons r
    where r.code = new.reason_code
      and r.is_active
      and new.type = any (r.applies_to)
  ) then
    raise exception 'رمز السبب "%" غير معتمد لحركة %.', new.reason_code, new.type
      using errcode = 'BD400';
  end if;
  return new;
end $$;

create trigger stock_movements_reason_scope
  before insert on core.stock_movements
  for each row
  when (new.reason_code is not null)
  execute function private.enforce_reason_scope();

-- ════════════════════════════════════════════════════════════════════════════
-- 3) الدوال — الفحص الحاسم تحت قفل المشروع، والأختام الدلالية، والنطاقات
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

  -- إخفاق سريع غير حاسم — الفحص الملزم يتكرر تحت قفل المشروع أدناه
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

  -- ★ الفحص الحاسم تحت قفل المشروع (المشروع دائمًا آخر الأقفال)
  select p.status_code, p.lock_version into v_status, v_lock_ver
  from core.projects p where p.id = p_project_id for update;

  if v_status not in ('customer_approved', 'fabric_allocated', 'with_tailor') then
    raise exception 'لا يمكن الحجز والمشروع في حالة "%".', v_status
      using errcode = 'BD409';
  end if;
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
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
     notes, created_by, idempotency_key)
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
  p_reason_code     text    default null,
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
  v_remaining numeric(12,3); v_from_res numeric(12,3); v_over numeric(12,3);
  v_bal record; v_group uuid; v_new_status core.reservation_status;
  v_payload jsonb; v_prior core.client_operations%rowtype;
  v_usage_id uuid; v_notified boolean := false; v_result jsonb;
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
    raise exception 'الاستهلاك يسجّله الأدمن أو الخياط المسند لهذا المشروع.'
      using errcode = 'BD403';
  end if;

  v_payload := jsonb_build_object(
    'op', 'consume_fabric', 'user_id', v_uid,
    'reservation_id', p_reservation_id, 'quantity_m', v_qty,
    'reason_code', coalesce(v_code, ''), 'notes', v_notes);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- إخفاق سريع — الفحص الملزم تحت قفل المشروع لاحقًا
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  -- الأقفال: roll ← reservation ← project (المشروع أخيرًا دائمًا)
  select r.code into v_roll_code from core.fabric_rolls r where r.id = v_roll for update;
  select * into v_res from core.fabric_reservations where id = p_reservation_id for update;
  select p.lock_version, p.tailor_id into v_lock_ver, v_tailor
  from core.projects p where p.id = v_project for update;

  -- ★ الفحوص الحاسمة تحت القفل: الإصدار + الإسناد
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;
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
    raise exception 'الحجز % — لا يمكن الاستهلاك منه.',
      case v_res.status when 'released' then 'محرَّر' else 'مغلق' end
      using errcode = 'BD409';
  end if;

  v_remaining := private.reservation_remaining(p_reservation_id);
  v_from_res  := least(v_qty, greatest(0, v_remaining));
  v_over      := pg_catalog.round(v_qty - v_from_res, 3);

  -- الرمز يخص الزيادة وحدها؛ بلا زيادة يُهمل (الاستهلاك المخطط ليس استثناء)
  if v_over = 0 then
    v_code := null;
  end if;

  select * into v_bal from private.roll_balance(v_roll);

  if v_qty > v_bal.on_hand_m then
    raise exception 'الاستهلاك (% م) أكبر من الموجود فعليًا (% م) في الرول %.',
      v_qty, v_bal.on_hand_m, v_roll_code using errcode = 'BD422';
  end if;

  if v_over > 0 then
    if v_code is null then
      raise exception 'الاستهلاك يتجاوز المحجوز بـ% م — رمز السبب إلزامي.', v_over
        using errcode = 'BD400';
    end if;
    if not exists (
      select 1 from core.movement_reasons
      where code = v_code and is_active
        and 'overconsumption'::core.movement_type = any (applies_to)
    ) then
      raise exception 'رمز السبب "%" غير معتمد لهذه العملية.', v_code
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
       notes, created_by, idempotency_key, operation_group_id)
    values (v_org, v_roll, 'consumption', v_from_res, v_project, p_reservation_id,
            v_notes, v_uid, p_idempotency_key, v_group);
  end if;

  if v_over > 0 then
    insert into core.stock_movements
      (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
       reason_code, notes, created_by, idempotency_key, operation_group_id)
    values (v_org, v_roll, 'overconsumption', v_over, v_project, p_reservation_id,
            v_code, v_notes, v_uid, gen_random_uuid(), v_group);
  end if;

  v_new_status := private.reservation_status_for(
    v_res.quantity_m,
    pg_catalog.round(v_res.consumed_m + v_from_res, 3),
    v_res.released_m,
    v_res.damaged_reserved_m);

  update core.fabric_reservations
     set consumed_m   = pg_catalog.round(consumed_m + v_from_res, 3),
         status       = v_new_status,
         finalized_at = case
           when v_new_status in ('consumed','released','closed') and finalized_at is null
           then now() else finalized_at end
   where id = p_reservation_id;

  insert into core.fabric_usage
    (organization_id, project_id, reservation_id, roll_id,
     planned_m, actual_m, waste_m, reason_code, notes, created_by)
  values (v_org, v_project, p_reservation_id, v_roll,
          v_from_res, v_qty, v_over, v_code, v_notes, v_uid)
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
           format('الرول %s: استهلاك %s م بزيادة %s م. السبب: %s%s',
                  v_roll_code, v_qty, v_over,
                  (select label_ar from core.movement_reasons where code = v_code),
                  case when v_notes <> '' then ' — ' || v_notes else '' end),
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
  v_qty numeric(12,3); v_code text; v_notes text;
  v_remaining numeric(12,3); v_bal record;
  v_payload jsonb; v_prior core.client_operations%rowtype;
  v_new_status core.reservation_status; v_result jsonb;
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
    raise exception 'رمز سبب التحرير إلزامي.' using errcode = 'BD400';
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
      and 'reservation_release'::core.movement_type = any (applies_to)
  ) then
    raise exception 'رمز السبب "%" غير معتمد لهذه العملية.', v_code
      using errcode = 'BD400';
  end if;

  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  -- الأقفال: roll ← reservation ← project
  select r.code into v_roll_code from core.fabric_rolls r where r.id = v_roll for update;
  select * into v_res from core.fabric_reservations where id = p_reservation_id for update;
  select p.lock_version into v_lock_ver
  from core.projects p where p.id = v_project for update;

  -- ★ الفحص الحاسم تحت القفل
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
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
     reason_code, notes, created_by, idempotency_key)
  values (v_org, v_roll, 'reservation_release', v_qty, v_project, p_reservation_id,
          v_code, v_notes, v_uid, p_idempotency_key);

  v_new_status := private.reservation_status_for(
    v_res.quantity_m,
    v_res.consumed_m,
    pg_catalog.round(v_res.released_m + v_qty, 3),
    v_res.damaged_reserved_m);

  -- released_at للتحرير النقي فقط؛ finalized_at لأي نهاية
  update core.fabric_reservations
     set released_m   = pg_catalog.round(released_m + v_qty, 3),
         status       = v_new_status,
         released_at  = case
           when v_new_status = 'released' and v_res.status <> 'released'
           then now() else released_at end,
         finalized_at = case
           when v_new_status in ('consumed','released','closed') and finalized_at is null
           then now() else finalized_at end
   where id = p_reservation_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'inventory.release', 'fabric_reservation',
          p_reservation_id::text,
          format('تحرير %s م من الرول %s — %s', v_qty, v_roll_code,
                 (select label_ar from core.movement_reasons where code = v_code)),
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

create or replace function api.return_consumed_fabric(
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

  select * into v_usage from core.fabric_usage where id = p_fabric_usage_id;
  if not found then
    raise exception 'سجل الاستهلاك غير موجود.' using errcode = 'BD404';
  end if;
  v_org := v_usage.organization_id; v_project := v_usage.project_id;
  v_roll := v_usage.roll_id;        v_reservation := v_usage.reservation_id;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
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

  if not exists (
    select 1 from core.movement_reasons
    where code = v_code and is_active
      and 'return'::core.movement_type = any (applies_to)
  ) then
    raise exception 'رمز السبب "%" غير معتمد لهذه العملية.', v_code
      using errcode = 'BD400';
  end if;

  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  -- الأقفال: roll ← usage ← project
  select r.code into v_roll_code from core.fabric_rolls r where r.id = v_roll for update;
  select * into v_usage from core.fabric_usage where id = p_fabric_usage_id for update;
  select p.lock_version into v_lock_ver
  from core.projects p where p.id = v_project for update;

  -- ★ الفحص الحاسم تحت القفل
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
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

create or replace function api.record_reserved_damage(
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

  if not exists (
    select 1 from core.movement_reasons
    where code = v_code and is_active
      and 'damage_reserved'::core.movement_type = any (applies_to)
  ) then
    raise exception 'رمز السبب "%" غير معتمد لهذه العملية.', v_code
      using errcode = 'BD400';
  end if;

  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  -- الأقفال: roll ← reservation ← project
  select r.code into v_roll_code from core.fabric_rolls r where r.id = v_roll for update;
  select * into v_res from core.fabric_reservations where id = p_reservation_id for update;
  select p.lock_version, p.tailor_id into v_lock_ver, v_tailor
  from core.projects p where p.id = v_project for update;

  -- ★ الفحوص الحاسمة تحت القفل: الإصدار + الإسناد معًا
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;
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

  -- التلف لا يمسّ released_at أبدًا — finalized_at وحده عند الإغلاق
  update core.fabric_reservations
     set damaged_reserved_m = pg_catalog.round(damaged_reserved_m + v_qty, 3),
         status       = v_new_status,
         finalized_at = case
           when v_new_status in ('consumed','released','closed') and finalized_at is null
           then now() else finalized_at end
   where id = p_reservation_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'inventory.damage_reserved', 'fabric_reservation',
          p_reservation_id::text,
          format('تلف %s م من محجوز الرول %s — %s', v_qty, v_roll_code,
                 (select label_ar from core.movement_reasons where code = v_code)),
          v_payload);

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

create or replace function api.record_stock_damage(
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
end $$;

notify pgrst, 'reload schema';
