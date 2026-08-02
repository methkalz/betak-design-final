-- ============================================================================
-- بيتك ديزاين — 0026 — مصدر مركزي لأثر الحركات + محاسبة الزيادة والتلف المحجوز
--
-- ثلاثة أهداف، كلها من مراجعة الفريق:
--
-- 1) core.movement_effects — المرجع الوحيد لأثر كل نوع حركة على الرصيد.
--    كانت مصفوفة الأثر منسوخة في 5 مواضع (views + أجسام RPC) وأي تعديل
--    مستقبلي كان سيتباعد بينها حتمًا. الآن: جدول مرجعي واحد، وكل الحسابات
--    تُشتق منه (sum(quantity_m * sign)).
--
-- 2) overconsumption بدل adjustment_out للزيادة عن الحجز — مع
--    operation_group_id يربط حركتَي الإجراء الواحد. تقارير تصحيح الجرد
--    لم تعد تختلط باستهلاك المشاريع.
--
-- 3) damaged_reserved_m على الحجوزات — يوسّع الـinvariant قبل بناء
--    record_fabric_damage لا بعده:
--        quantity_m = consumed_m + released_m + damaged_reserved_m + remaining
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1) المرجع المركزي لأثر الحركات
-- ════════════════════════════════════════════════════════════════════════════

create table core.movement_effects (
  type          core.movement_type primary key,
  on_hand_sign  smallint not null check (on_hand_sign  in (-1, 0, 1)),
  reserved_sign smallint not null check (reserved_sign in (-1, 0, 1)),
  label_ar      text     not null
);

comment on table core.movement_effects is
  'المصدر الوحيد لأثر كل نوع حركة على on_hand و reserved. '
  'كل view أو دالة تحسب رصيدًا يجب أن تشتق من هذا الجدول — لا مصفوفات مضمّنة. '
  'available تُشتق دائمًا: greatest(0, on_hand − reserved).';

insert into core.movement_effects (type, on_hand_sign, reserved_sign, label_ar) values
  ('receipt',              1,  0, 'استلام'),
  ('reservation',          0,  1, 'حجز'),
  ('reservation_release',  0, -1, 'فك حجز'),
  ('consumption',         -1, -1, 'استهلاك'),
  ('overconsumption',     -1,  0, 'استهلاك زائد'),
  ('return',               1,  0, 'إرجاع'),
  ('damage',              -1,  0, 'تلف'),
  ('adjustment_in',        1,  0, 'تسوية دخول'),
  ('adjustment_out',      -1,  0, 'تسوية خروج'),
  ('transfer_in',          1,  0, 'تحويل وارد'),
  ('transfer_out',        -1,  0, 'تحويل صادر');

-- ملاحظة: damage الحالية تعني تلفًا من المخزون المتاح (reserved_sign = 0).
-- تلف الكمية المحجوزة سيأتي مع RPC التلف — إما كقيمة enum جديدة أو كحركتين
-- مجمّعتين بـ operation_group_id. يُحسم هناك، والمصفوفة تُحدَّث هنا فقط.

-- بيانات مرجعية عامة كـ project_statuses: قراءة للجميع، ولا كتابة لأحد
alter table core.movement_effects enable row level security;
alter table core.movement_effects force row level security;
create policy "anyone reads movement effects"
  on core.movement_effects for select to authenticated using (true);
grant select on core.movement_effects to authenticated, baytak_rpc_owner;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) operation_group_id — يربط حركات الإجراء الواحد
-- ════════════════════════════════════════════════════════════════════════════

alter table core.stock_movements
  add column operation_group_id uuid;

comment on column core.stock_movements.operation_group_id is
  'يجمع حركات إجراء مستخدم واحد (استهلاك 30 + زيادة 5 = صفان بنفس المعرّف). '
  'يُولَّد داخل الـRPC حصرًا — لا يُقبل من الجهاز أبدًا.';

create index stock_movements_operation_group_idx
  on core.stock_movements (operation_group_id)
  where operation_group_id is not null;

-- الزيادة تستوجب سببًا صريحًا كما التلف والتسويات
alter table core.stock_movements drop constraint reason_required_for_exceptions;
alter table core.stock_movements add constraint reason_required_for_exceptions
  check (
    type not in ('damage', 'adjustment_in', 'adjustment_out', 'overconsumption')
    or length(btrim(reason)) > 0
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 3) damaged_reserved_m والـinvariant الموسّع
-- ════════════════════════════════════════════════════════════════════════════

alter table core.fabric_reservations
  add column damaged_reserved_m numeric(12,3) not null default 0
    check (damaged_reserved_m >= 0);

comment on column core.fabric_reservations.damaged_reserved_m is
  'ما تلف من الكمية المحجوزة. يدخل في الـinvariant: '
  'quantity_m = consumed_m + released_m + damaged_reserved_m + remaining.';

alter table core.fabric_reservations drop constraint reservation_balance_invariant;
alter table core.fabric_reservations add constraint reservation_balance_invariant
  check (consumed_m + released_m + damaged_reserved_m <= quantity_m);

comment on constraint reservation_balance_invariant on core.fabric_reservations is
  'يفرض على المحرك: reserved_initial = consumed + released + damaged + remaining.';

-- المتبقي — الصيغة في مكان واحد فقط
create or replace function private.reservation_remaining(p_reservation_id uuid)
returns numeric
language sql stable
set search_path = ''
as $$
  select pg_catalog.round(quantity_m - consumed_m - released_m - damaged_reserved_m, 3)
  from core.fabric_reservations where id = p_reservation_id;
$$;

-- رصيد الرول — الصيغة في مكان واحد، مشتقة من movement_effects
create or replace function private.roll_balance(p_roll_id uuid)
returns table (on_hand_m numeric, reserved_m numeric, available_m numeric)
language sql stable
set search_path = ''
as $$
  with agg as (
    select
      pg_catalog.round(coalesce(sum(m.quantity_m * e.on_hand_sign),  0), 3) as oh,
      greatest(0,
        pg_catalog.round(coalesce(sum(m.quantity_m * e.reserved_sign), 0), 3)) as rs
    from core.stock_movements m
    join core.movement_effects e on e.type = m.type
    where m.roll_id = p_roll_id
  )
  select oh, rs, greatest(0, pg_catalog.round(oh - rs, 3)) from agg;
$$;

comment on function private.roll_balance(uuid) is
  'رصيد الرول من دفتر الحركة عبر movement_effects. كل RPC مخزون يستدعيها — '
  'ممنوع تضمين مصفوفة الأثر يدويًا في أي دالة.';

grant execute on function private.reservation_remaining(uuid),
                          private.roll_balance(uuid)
  to authenticated, baytak_rpc_owner;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) الviews تشتق من المرجع المركزي
-- ════════════════════════════════════════════════════════════════════════════

create or replace view api.roll_balances with (security_invoker = on) as
select
  m.roll_id,
  m.organization_id,
  round(coalesce(sum(m.quantity_m * e.on_hand_sign), 0), 3)              as on_hand_m,
  greatest(0, round(coalesce(sum(m.quantity_m * e.reserved_sign), 0), 3)) as reserved_m,
  round(coalesce(sum(m.quantity_m)
        filter (where m.type in ('consumption', 'overconsumption')), 0), 3) as consumed_m
from core.stock_movements m
join core.movement_effects e on e.type = m.type
group by m.roll_id, m.organization_id;

comment on view api.roll_balances is
  'مشتق من movement_effects — لا مصفوفة أثر مضمّنة. consumed_m يشمل الزيادة.';

-- الاتجاه يُشتق من الإشارة، و operation_group_id يُلحق في آخر القائمة
-- (CREATE OR REPLACE VIEW يسمح بإضافة أعمدة في النهاية فقط)
create or replace view api.stock_movements with (security_invoker = on) as
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
  m.reason,
  m.created_by,
  p.full_name as created_by_name,
  m.created_at,
  m.operation_group_id
from core.stock_movements m
join core.movement_effects e on e.type = m.type
join core.fabric_rolls r  on r.id = m.roll_id
left join core.profiles p on p.id = m.created_by;

-- المتبقي في view الحجوزات يطرح التالف أيضًا
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
  res.damaged_reserved_m
from core.fabric_reservations res
join core.fabric_rolls r    on r.id = res.roll_id
join core.fabric_variants v on v.id = r.variant_id;

grant select on api.roll_balances, api.stock_movements, api.fabric_reservations
  to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 5) الـRPCs الثلاثة تستهلك المصادر المركزية
--    postgres عضو في baytak_rpc_owner، و CREATE OR REPLACE يحفظ الملكية
--    والصلاحيات — فلا حاجة لدورة grant create / alter owner هنا.
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

  if v_status not in ('customer_approved', 'fabric_allocated', 'with_tailor') then
    raise exception 'لا يمكن الحجز والمشروع في حالة "%". يلزم اعتماد الزبون أولًا.',
      v_status using errcode = 'BD409';
  end if;
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
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

  -- القفل يسلسل الحجوزات على هذا الرول
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

  -- الرصيد من المصدر المركزي — بعد القفل
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

  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  v_payload := jsonb_build_object(
    'op', 'consume_fabric', 'user_id', v_uid,
    'reservation_id', p_reservation_id, 'quantity_m', v_qty);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- الأقفال بالترتيب الثابت: roll ← reservation
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

  -- المتبقي والرصيد من المصدرين المركزيين — بعد القفل
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

  -- حركتان محاسبيتان لإجراء مستخدم واحد، مربوطتان بمجموعة واحدة.
  -- المعرّف يُولَّد هنا — لا يُقبل من الجهاز.
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

  insert into core.fabric_usage
    (organization_id, project_id, reservation_id, roll_id,
     planned_m, actual_m, waste_m, reason, created_by)
  values (v_org, v_project, p_reservation_id, v_roll,
          greatest(0, v_remaining), v_qty, v_over, coalesce(p_reason,''), v_uid)
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
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  v_payload := jsonb_build_object(
    'op', 'release_reservation', 'user_id', v_uid,
    'reservation_id', p_reservation_id, 'quantity_m', v_qty);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- الأقفال بالترتيب الثابت: roll ← reservation
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

  -- المتبقي من المصدر المركزي: الأصلي − المستهلك − المحرَّر − التالف
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
