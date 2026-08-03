-- ============================================================================
-- بيتك ديزاين — 0033 — الأسباب المهيكلة: reason_code منفصل عن notes
--
-- المراجعة أمسكت فجوة تسمية بمعنى حقيقي: التقرير قال «reason_code مفروض على
-- المحرّك» بينما العمود نص حر وقيده «غير فارغ» فقط — أي نص عشوائي يمرّ،
-- و«أسباب مرمّزة قابلة للتجميع» لم تكن محققة على مستوى البيانات. والأسوأ:
-- release كانت تخزّن 'code — notes' في حقل واحد، فتجميع التقارير حسب السبب
-- يرى كل ملاحظة قيمةً مستقلة.
--
-- النموذج المعتمد (خيار الطاقم الأفضل):
--   reason_code  → FK إلى جدول مرجعي core.movement_reasons (القائمة قابلة
--                  للتوسعة، والرمز غير المعتمد يُرفض من المحرّك)
--   notes        → نص حر، لا يُدمج بالرمز أبدًا
--
-- ترقية البصمة v3 آمنة تاريخيًا بدليل مثبت قبل هذا الترحيل:
--   client_operations = 0 صفوف (استعلام الطاقم الحرفي) — لا عمليات v2 حقيقية.
-- ============================================================================

-- ── جدول الأسباب المرجعي ────────────────────────────────────────────────────
create table core.movement_reasons (
  code       text primary key check (code ~ '^[a-z][a-z0-9_]{2,40}$'),
  label_ar   text not null check (length(btrim(label_ar)) > 0),
  is_active  boolean not null default true,
  sort_order integer not null default 100
);

comment on table core.movement_reasons is
  'الأسباب المعتمدة لحركات المخزون الاستثنائية. القائمة تُوسَّع بترحيل أو من '
  'الأدمن لاحقًا — الرمز غير الموجود/غير الفعال يُرفض في الـRPC وبالـFK معًا.';

insert into core.movement_reasons (code, label_ar, sort_order) values
  ('cutting_error',     'خطأ في القص',            10),
  ('sewing_error',      'خطأ في الخياطة',          20),
  ('pattern_matching',  'تطابق نقشة القماش',       30),
  ('design_change',     'تغيير في التصميم',        40),
  ('customer_change',   'تغيير من الزبون',         50),
  ('project_cancelled', 'إلغاء المشروع',           60),
  ('over_reserved',     'حجز زائد عن الحاجة',      70),
  ('leftover_return',   'إرجاع بقايا بعد التفصيل', 80),
  ('quality_defect',    'عيب جودة في القماش',      90),
  ('water_damage',      'تلف بالماء أو الرطوبة',  100),
  ('storage_damage',    'تلف أثناء التخزين',      110),
  ('other',             'سبب آخر (فصّل في الملاحظات)', 900);

alter table core.movement_reasons enable row level security;
alter table core.movement_reasons force row level security;
create policy "anyone reads movement reasons"
  on core.movement_reasons for select to authenticated using (true);
grant select on core.movement_reasons to authenticated, baytak_rpc_owner;

-- ── دفتر الحركة: فصل الرمز عن الملاحظات ─────────────────────────────────────
alter table core.stock_movements rename column reason to notes;
alter table core.stock_movements
  add column reason_code text references core.movement_reasons (code);

comment on column core.stock_movements.reason_code is
  'رمز معتمد من movement_reasons — عليه تُبنى تقارير الهدر والإرجاع.';
comment on column core.stock_movements.notes is
  'نص حر. لا يُدمج بالرمز أبدًا — الدمج يفسد التجميع في التقارير.';

alter table core.stock_movements drop constraint reason_required_for_exceptions;
alter table core.stock_movements add constraint reason_code_required_for_exceptions
  check (
    type not in ('damage', 'damage_reserved', 'adjustment_in', 'adjustment_out',
                 'overconsumption', 'return')
    or reason_code is not null
  );

comment on constraint reason_code_required_for_exceptions on core.stock_movements is
  'الحركات الاستثنائية تحتاج رمز سبب معتمدًا (FK) — لا نصًا حرًّا غير فارغ.';

-- ── سجل الاستهلاك: نفس الفصل ────────────────────────────────────────────────
alter table core.fabric_usage rename column reason to notes;
alter table core.fabric_usage
  add column reason_code text references core.movement_reasons (code);

alter table core.fabric_usage drop constraint reason_required_when_over_plan;
alter table core.fabric_usage add constraint reason_code_required_when_over_plan
  check (actual_m <= planned_m or reason_code is not null);
alter table core.fabric_usage drop constraint reason_required_for_waste;
alter table core.fabric_usage add constraint reason_code_required_for_waste
  check (waste_m = 0 or reason_code is not null);

-- ── الviews: عمود مُعاد تسميته = DROP ثم CREATE (لا يكفي OR REPLACE) ─────────
drop view if exists api.stock_movements;
create view api.stock_movements with (security_invoker = on) as
select
  m.id as movement_id,
  m.organization_id,
  m.roll_id,
  r.code as roll_code,
  m.type,
  m.quantity_m,
  case when e.on_hand_sign > 0 then 'in'
       when e.on_hand_sign < 0 then 'out'
       else 'hold' end as direction,
  m.project_id,
  m.reservation_id,
  m.reason_code,
  mr.label_ar as reason_label,
  m.notes,
  m.created_by,
  p.full_name as created_by_name,
  m.created_at,
  m.operation_group_id,
  m.fabric_usage_id
from core.stock_movements m
join core.movement_effects e on e.type = m.type
join core.fabric_rolls r  on r.id = m.roll_id
left join core.movement_reasons mr on mr.code = m.reason_code
left join core.profiles p on p.id = m.created_by;

drop view if exists api.fabric_usage;
create view api.fabric_usage with (security_invoker = on) as
select
  u.id as usage_id,
  u.organization_id,
  u.project_id,
  u.reservation_id,
  u.roll_id,
  u.planned_m,
  u.actual_m,
  u.waste_m,
  round(u.actual_m - u.planned_m, 3) as variance_m,
  (u.actual_m > u.planned_m) as over_plan,
  u.reason_code,
  mr.label_ar as reason_label,
  u.notes,
  u.created_by,
  u.created_at
from core.fabric_usage u
left join core.movement_reasons mr on mr.code = u.reason_code;

grant select on api.stock_movements, api.fabric_usage to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- consume_fabric — توقيع جديد (p_reason_code + p_notes بدل p_reason الحر).
-- تغيير التوقيع = دالة أخرى في بوستجرس، فالإسقاط الصريح إلزامي وإلا بقيتا معًا.
-- ════════════════════════════════════════════════════════════════════════════

-- مؤقت لنقل الملكية (ALTER … OWNER TO تشترط CREATE) — يُسحب في نهاية الملف
grant create on schema api to baytak_rpc_owner;

drop function api.consume_fabric(uuid, numeric, uuid, text, integer);

create function api.consume_fabric(
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
  v_qty numeric(12,3); v_code text; v_notes text;
  v_remaining numeric(12,3); v_from_res numeric(12,3); v_over numeric(12,3);
  v_bal record; v_group uuid;
  v_payload jsonb; v_prior core.client_operations%rowtype;
  v_usage_id uuid; v_notified boolean := false; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;

  -- تطبيع v3: القيمة المطبَّعة هي المستخدمة في البصمة والتخزين معًا
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

  -- صلاحية الرمز — بعد احتمال الإعادة، وقبل أي أثر
  if v_code is not null and not exists (
    select 1 from core.movement_reasons where code = v_code and is_active
  ) then
    raise exception 'رمز السبب "%" غير معتمد.', v_code using errcode = 'BD400';
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
    if v_code is null then
      raise exception 'الاستهلاك يتجاوز المحجوز بـ% م — رمز السبب إلزامي.', v_over
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
       reason_code, notes, created_by, idempotency_key, operation_group_id)
    values (v_org, v_roll, 'consumption', v_from_res, v_project, p_reservation_id,
            v_code, v_notes, v_uid, p_idempotency_key, v_group);
  end if;

  if v_over > 0 then
    insert into core.stock_movements
      (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
       reason_code, notes, created_by, idempotency_key, operation_group_id)
    values (v_org, v_roll, 'overconsumption', v_over, v_project, p_reservation_id,
            v_code, v_notes, v_uid, gen_random_uuid(), v_group);
  end if;

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

alter function api.consume_fabric(uuid, numeric, uuid, text, text, integer)
  owner to baytak_rpc_owner;
revoke all on function api.consume_fabric(uuid, numeric, uuid, text, text, integer)
  from public, anon;
grant execute on function api.consume_fabric(uuid, numeric, uuid, text, text, integer)
  to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- release_reservation — نفس التوقيع؛ يتوقف الدمج ويُخزَّن الرمز والملاحظات منفصلين
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

  if not exists (select 1 from core.movement_reasons where code = v_code and is_active) then
    raise exception 'رمز السبب "%" غير معتمد.', v_code using errcode = 'BD400';
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
     reason_code, notes, created_by, idempotency_key)
  values (v_org, v_roll, 'reservation_release', v_qty, v_project, p_reservation_id,
          v_code, v_notes, v_uid, p_idempotency_key);

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

revoke create on schema api from baytak_rpc_owner;

notify pgrst, 'reload schema';
