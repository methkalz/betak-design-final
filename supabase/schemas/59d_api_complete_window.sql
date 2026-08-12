-- ════════════════════════════════════════════════════════════════════
-- api.complete_window
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.complete_window(p_window_id uuid, p_actual_m numeric, p_idempotency_key uuid, p_reason_code text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_expected_project_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_project uuid;
  v_win record; v_is_admin boolean; v_tailor uuid; v_lock_ver integer;
  v_actual numeric(12,3); v_planned numeric(12,3); v_over_plan boolean;
  v_code text; v_notes text; v_move_notes text;
  v_locked_rolls uuid[] := '{}'; v_locked_res uuid[] := '{}';
  v_res_ids uuid[] := '{}'; v_roll_ids uuid[] := '{}';
  v_roll_codes text[] := '{}'; v_takes numeric[] := '{}';
  v_candidates integer := 0; v_last_res uuid; v_last_roll uuid; v_last_code text;
  r record; v_r core.fabric_reservations%rowtype;
  v_remaining numeric(12,3); v_take numeric(12,3); v_left numeric(12,3);
  v_over numeric(12,3); v_extra numeric(12,3); v_slice_actual numeric(12,3);
  v_planned_left numeric(12,3); v_share numeric(12,3); v_waste numeric(12,3);
  v_group uuid; v_bal record; v_new_status core.reservation_status;
  v_usage_id uuid; v_i integer; v_n integer;
  v_slices jsonb := '[]'::jsonb; v_notified boolean := false;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  v_actual := pg_catalog.round(p_actual_m, 3);
  if v_actual is null or v_actual <= 0 then
    raise exception 'الكمية المستهلكة مطلوبة.' using errcode = 'BD400';
  end if;
  v_code  := nullif(pg_catalog.btrim(coalesce(p_reason_code, '')), '');
  v_notes := pg_catalog.btrim(coalesce(p_notes, ''));

  select w.id, w.name, w.project_id, w.organization_id,
         w.width_cm, w.quantity, w.fullness, w.fabric_variant_id
    into v_win
  from core.windows w where w.id = p_window_id;
  if v_win.id is null then
    raise exception 'الشباك غير موجود.' using errcode = 'BD404';
  end if;
  v_org := v_win.organization_id; v_project := v_win.project_id;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  if v_win.fabric_variant_id is null then
    raise exception 'الشباك بلا قماش محدد - اختر القماش أولًا.' using errcode = 'BD422';
  end if;

  v_is_admin := private.has_role(v_org, array['admin']::core.app_role[]);
  select p.lock_version, p.tailor_id into v_lock_ver, v_tailor
  from core.projects p where p.id = v_project;
  if not (v_is_admin
          or (private.has_role(v_org, array['tailor']::core.app_role[])
              and v_tailor = v_uid)) then
    raise exception 'إنهاء الشباك يسجّله الأدمن أو الخياط المسند لهذا المشروع.'
      using errcode = 'BD403';
  end if;

  -- مخطط الشباك من قياساته: عرض × عدد × مضاعف (مرآة windowFabricNeed)
  v_planned := pg_catalog.round(v_win.width_cm / 100 * v_win.quantity * v_win.fullness, 3);
  v_over_plan := v_actual > v_planned;

  v_payload := jsonb_build_object(
    'op', 'complete_window', 'user_id', v_uid,
    'window_id', p_window_id, 'actual_m', v_actual,
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

  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  -- الأقفال بترتيب consume_fabric نفسه فلا تعانق قفليهما:
  -- الرولات (بترتيب المعرّف) ← الحجوزات (كذلك) ← المشروع أخيرًا.
  -- المقفول يُجمَّد في مصفوفتين وتعمل الدالة عليه حصرًا: ما وُلد من حجوزات
  -- بعد لحظة القفل لا يُمَسّ - فلا صفَّ يُكتب إلا وصفُّه ورولُّه بيدنا
  with locked as (
    select fr.id from core.fabric_rolls fr
    where fr.id in (
      select r2.roll_id from core.fabric_reservations r2
      join core.fabric_rolls fr2 on fr2.id = r2.roll_id
      where r2.project_id = v_project
        and r2.status not in ('released', 'closed')
        and fr2.variant_id = v_win.fabric_variant_id)
    order by fr.id for update
  )
  select coalesce(array_agg(id), '{}') into v_locked_rolls from locked;

  with locked as (
    select r3.id from core.fabric_reservations r3
    where r3.project_id = v_project
      and r3.status not in ('released', 'closed')
      and r3.roll_id = any (v_locked_rolls)
    order by r3.id for update
  )
  select coalesce(array_agg(id), '{}') into v_locked_res from locked;

  select p.lock_version, p.tailor_id into v_lock_ver, v_tailor
  from core.projects p where p.id = v_project for update;

  -- ★ الفحوص الحاسمة تحت القفل
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

  if exists (select 1 from core.fabric_usage u where u.window_id = p_window_id) then
    raise exception 'هذا الشباك مسجَّل منجزًا بالفعل.' using errcode = 'BD409';
  end if;

  -- التمريرة الأولى (قراءة): توزيع الكمية على الحجوزات بالأقدم فالأقدم،
  -- والمتبقي المحجوز بحسابه القانوني (يخصم المحرَّر والتالف لا المستهلك وحده)
  v_left := v_actual;
  for r in
    select res.id, res.roll_id, fr.code as roll_code
    from core.fabric_reservations res
    join core.fabric_rolls fr on fr.id = res.roll_id
    where res.id = any (v_locked_res)
    order by res.created_at, res.id
  loop
    v_candidates := v_candidates + 1;
    v_last_res := r.id; v_last_roll := r.roll_id; v_last_code := r.roll_code;
    if v_left <= 0 then continue; end if;
    v_remaining := private.reservation_remaining(r.id);
    if v_remaining <= 0 then continue; end if;
    v_take := least(v_remaining, v_left);
    v_res_ids := v_res_ids || r.id;
    v_roll_ids := v_roll_ids || r.roll_id;
    v_roll_codes := v_roll_codes || r.roll_code;
    v_takes := v_takes || v_take;
    v_left := pg_catalog.round(v_left - v_take, 3);
  end loop;

  if v_candidates = 0 then
    raise exception 'لا يوجد قماش محجوز لهذا الشباك - راجع تبويب القماش.'
      using errcode = 'BD422';
  end if;

  -- ما فاض عن كل الحجوزات يركب آخرها زيادةً (كما في التطبيق)
  v_over := greatest(0, v_left);
  if array_length(v_res_ids, 1) is null then
    v_res_ids := array[v_last_res]; v_roll_ids := array[v_last_roll];
    v_roll_codes := array[v_last_code]; v_takes := array[0::numeric];
  end if;

  -- السبب إلزامي لأي زيادة: عن مخطط الشباك أو عن المحجوز - وكلٌّ برسالته
  -- الصادقة، فتجاوز المحجوز ليس تجاوزًا للمخطط
  if v_over_plan or v_over > 0 then
    if v_code is null then
      if v_over_plan then
        raise exception 'الاستهلاك أعلى من المخطط (% م) - اكتب السبب.', v_planned
          using errcode = 'BD400';
      else
        raise exception 'الاستهلاك يتجاوز المحجوز بـ% م - اكتب السبب.', v_over
          using errcode = 'BD400';
      end if;
    end if;
    if not exists (
      select 1 from core.movement_reasons
      where code = v_code and is_active
        and 'overconsumption'::core.movement_type = any (applies_to)
    ) then
      raise exception 'رمز السبب "%" غير معتمد لهذه العملية.', v_code
        using errcode = 'BD400';
    end if;
  else
    v_code := null;
  end if;

  -- التمريرة الثانية (كتابة): حركات وقيود استهلاك لكل شريحة، والمخطط
  -- يُوزَّع بالترتيب فيبقى مجموعه = مخطط الشباك ويخرج الهدر صحيحًا
  v_group := gen_random_uuid();
  v_move_notes := case when v_notes <> '' then v_notes
                       else format('إنهاء %s', v_win.name) end;
  v_planned_left := v_planned;
  v_n := array_length(v_res_ids, 1);

  for v_i in 1..v_n loop
    v_extra := case when v_i = v_n then v_over else 0 end;
    v_take := v_takes[v_i];
    v_slice_actual := pg_catalog.round(v_take + v_extra, 3);
    if v_slice_actual <= 0 then continue; end if;

    select * into v_bal from private.roll_balance(v_roll_ids[v_i]);
    if v_slice_actual > v_bal.on_hand_m then
      raise exception 'الكمية (% م) أكبر من الرصيد الفعلي (% م) للرول %.',
        v_slice_actual, v_bal.on_hand_m, v_roll_codes[v_i] using errcode = 'BD422';
    end if;
    if v_extra > 0 and v_extra > v_bal.available_m then
      raise exception 'الزيادة (% م) أكبر من المتاح غير المحجوز (% م) في الرول %.',
        v_extra, v_bal.available_m, v_roll_codes[v_i] using errcode = 'BD422';
    end if;

    if v_take > 0 then
      insert into core.stock_movements
        (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
         notes, created_by, idempotency_key, operation_group_id)
      values (v_org, v_roll_ids[v_i], 'consumption', v_take, v_project, v_res_ids[v_i],
              v_move_notes, v_uid,
              case when v_i = 1 then p_idempotency_key else gen_random_uuid() end,
              v_group);
    end if;
    if v_extra > 0 then
      insert into core.stock_movements
        (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
         reason_code, notes, created_by, idempotency_key, operation_group_id)
      values (v_org, v_roll_ids[v_i], 'overconsumption', v_extra, v_project, v_res_ids[v_i],
              v_code, v_move_notes, v_uid, gen_random_uuid(), v_group);
    end if;

    select * into v_r from core.fabric_reservations where id = v_res_ids[v_i];
    v_new_status := private.reservation_status_for(
      v_r.quantity_m,
      pg_catalog.round(v_r.consumed_m + v_take, 3),
      v_r.released_m,
      v_r.damaged_reserved_m);
    update core.fabric_reservations
       set consumed_m   = pg_catalog.round(consumed_m + v_take, 3),
           status       = v_new_status,
           finalized_at = case
             when v_new_status in ('consumed','released','closed') and finalized_at is null
             then now() else finalized_at end
     where id = v_res_ids[v_i];

    v_share := least(v_planned_left, v_slice_actual);
    v_planned_left := pg_catalog.round(v_planned_left - v_share, 3);
    v_waste := pg_catalog.round(v_slice_actual - v_share, 3);
    insert into core.fabric_usage
      (organization_id, project_id, window_id, reservation_id, roll_id,
       planned_m, actual_m, waste_m, reason_code, notes, created_by)
    values (v_org, v_project, p_window_id, v_res_ids[v_i], v_roll_ids[v_i],
            v_share, v_slice_actual, v_waste,
            case when v_waste > 0 then v_code else null end, v_notes, v_uid)
    returning id into v_usage_id;

    v_slices := v_slices || jsonb_build_object(
      'reservation_id', v_res_ids[v_i], 'roll_id', v_roll_ids[v_i],
      'roll_code', v_roll_codes[v_i], 'consumed_m', v_take,
      'overconsumed_m', v_extra, 'usage_id', v_usage_id);
  end loop;

  if v_over_plan then
    insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
    select v_org, om.user_id, 'low_stock', 'استهلاك أعلى من المخطط',
           format('%s: %s م بدل %s م - %s%s', v_win.name, v_actual, v_planned,
                  coalesce((select label_ar from core.movement_reasons where code = v_code), ''),
                  case when v_notes <> '' then ' — ' || v_notes else '' end),
           '/project/' || v_project::text
    from core.organization_members om
    where om.organization_id = v_org and om.role = 'admin' and om.is_active;
    v_notified := true;
  end if;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'production.window_done', 'window', p_window_id::text,
          format('إنهاء %s باستهلاك %s م من %s م مخططة', v_win.name, v_actual, v_planned),
          v_payload || jsonb_build_object('operation_group_id', v_group));

  v_result := jsonb_build_object(
    'window_id', p_window_id,
    'planned_m', v_planned,
    'actual_m', v_actual,
    'overconsumed_m', v_over,
    'operation_group_id', v_group,
    'slices', v_slices,
    'admin_notification_created', v_notified,
    'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'complete_window', p_window_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;
