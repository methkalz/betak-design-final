-- ════════════════════════════════════════════════════════════════════
-- الحجز الذرّي بعد اعتماد الزبون
--
-- «الصنف كله أو لا شيء» عبر رولات عدة في معاملة خادمية واحدة: احتياج
-- المشروع يُحسب من شبابيكه (القماش بالمضاعف، البطانة بنسبة استهلاكها)،
-- والمحجوز سلفًا يُخصم، والانتقاء بعقيدة دفعة الصبغ - رول واحد يكفي
-- وحده أضيقُها هامشًا، وإلا الأكبر فالأكبر، وإلا نقص معلن بالأرقام.
-- المرحلة تتقدم إلى «قماش مخصص» فقط حين لا ينقص شيء. لا منح جداول
-- جديدة: المالك يكتب الحجوزات والحركات والمشاريع منذ دفعات المخزون.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.auto_reserve_for_project(p_project_id uuid, p_idempotency_key uuid, p_expected_project_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_status text; v_lock_ver integer;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
  v_need record; v_roll record;
  v_short jsonb := '[]'::jsonb;
  v_reserved_count integer := 0;
  v_total numeric(12,3); v_left numeric(12,3); v_take numeric(12,3);
  v_res_id uuid;
  v_group uuid := gen_random_uuid();
  v_first boolean := true;
  v_advanced boolean := false;
  v_locked_rolls uuid[];
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
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

  v_payload := jsonb_build_object(
    'op', 'auto_reserve_for_project', 'user_id', v_uid, 'project_id', p_project_id);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
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

  -- قفل كل رولات الأصناف المعنية دفعةً واحدة وبترتيب ثابت (الرولات قبل
  -- المشروع - المشروع دائمًا آخر الأقفال)، وتجميد المجموعة في مصفوفة
  -- كعقيدة complete_window: رولٌ يصل بعد هذه اللحظة غير مرئي لا «مرئي
  -- بلا قفل» - فلا حجز فوق المتاح ولا حجز جزئي صامت مع يدويٍّ متزامن
  select coalesce(array_agg(id), '{}'::uuid[]) into v_locked_rolls
  from (
    select r.id from core.fabric_rolls r
    where r.organization_id = v_org and r.retired_at is null
      and r.variant_id in (
        select w.fabric_variant_id from core.windows w
        where w.project_id = p_project_id and w.fabric_variant_id is not null
        union
        select w.lining_variant_id from core.windows w
        where w.project_id = p_project_id and w.has_lining and w.lining_variant_id is not null)
    order by r.id
    for update
  ) locked;

  -- ★ قفل المشروع قبل إعادة البحث: حين لا رولات تُقفل (مخزون فارغ) يبقى
  -- قفل المشروع هو ما يصفّف المتزامنين فتجد الإعادة عملية الأول لا 23505
  select p.status_code, p.lock_version into v_status, v_lock_ver
  from core.projects p where p.id = p_project_id for update;

  -- إعادة البحث بعد نيل الأقفال كلها تصطاد سباق النقر المزدوج
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- الفحص الحاسم تحت القفل
  if v_status not in ('customer_approved', 'fabric_allocated', 'with_tailor') then
    raise exception 'لا يمكن الحجز والمشروع في حالة "%".', v_status
      using errcode = 'BD409';
  end if;
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  -- الاحتياج لكل صنف (مرآة خطة التطبيق حرفيًا): القماش بعرض الشباك
  -- ومضاعفه، والبطانة بنسبة استهلاكها هي (70% ثلاثة أمتار للمتر الطولي،
  -- 100% متر ونصف) لا بمضاعف الستارة - وإن غابت النسبة فالمضاعف.
  -- المحجوز سلفًا يُخصم: ما استُهلك غطّى حاجته، وما فُكّ أو تلف لم يعد يغطي
  for v_need in
    -- الحساب بمسار التطبيق بتّةً بتّة: float8 هو double جافاسكريبت نفسه،
    -- وfloor(x*1000+0.5) هو Math.round حرفيًا - فلا ينفرج المساران 0.001
    -- عند منتصفات الألف (نحو %1.7 من مقاسات المضاعف 2.5)
    with wneeds as (
      select w.fabric_variant_id as variant_id,
             (pg_catalog.floor((w.width_cm::float8 / 100 * w.quantity * w.fullness::float8)
                * 1000 + 0.5) / 1000.0)::numeric(12,3) as meters
      from core.windows w
      where w.project_id = p_project_id and w.fabric_variant_id is not null
      union all
      select w.lining_variant_id,
             (pg_catalog.floor((w.width_cm::float8 / 100 * w.quantity *
               (case when fv.meters_per_running_meter > 0
                     then fv.meters_per_running_meter else w.fullness end)::float8)
                * 1000 + 0.5) / 1000.0)::numeric(12,3)
      from core.windows w
      join core.fabric_variants fv on fv.id = w.lining_variant_id
      where w.project_id = p_project_id and w.has_lining and w.lining_variant_id is not null
    ),
    needs as (
      select variant_id, pg_catalog.round(sum(meters), 3) as required
      from wneeds group by variant_id
    ),
    already as (
      select fr.variant_id,
             pg_catalog.round(sum(greatest(0,
               res.quantity_m - res.released_m - res.damaged_reserved_m)), 3) as reserved_m
      from core.fabric_reservations res
      join core.fabric_rolls fr on fr.id = res.roll_id
      where res.project_id = p_project_id and res.status <> 'released'
      group by fr.variant_id
    )
    select n.variant_id, n.required,
           pg_catalog.btrim(fp.name || ' ' || fv.color_name) as label,
           coalesce(a.reserved_m, 0) as reserved_m,
           pg_catalog.round(greatest(0, n.required - coalesce(a.reserved_m, 0)), 3) as remaining
    from needs n
    join core.fabric_variants fv on fv.id = n.variant_id
    join core.fabric_products fp on fp.id = fv.product_id
    left join already a on a.variant_id = n.variant_id
    order by n.variant_id
  loop
    continue when v_need.remaining <= 0;

    -- الأفضلية المطلقة لرولٍ واحد يكفي وحده: خلط دفعتَي صبغ في ستارة
    -- واحدة عيبٌ يُرى على الجدار ولا يُصلَح بعد القص. ومن الكافية أضيقها
    -- هامشًا - تبقى الرولات الكبيرة سليمة لمشاريع أكبر
    select r.id, r.code, b.available_m into v_roll
    from core.fabric_rolls r
    cross join lateral private.roll_balance(r.id) b
    where r.id = any(v_locked_rolls) and r.variant_id = v_need.variant_id
      and b.available_m >= v_need.remaining
    order by b.available_m asc, r.id asc
    limit 1;

    if found then
      insert into core.fabric_reservations
        (organization_id, project_id, roll_id, quantity_m, created_by)
      values (v_org, p_project_id, v_roll.id, v_need.remaining, v_uid)
      returning id into v_res_id;
      insert into core.stock_movements
        (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
         notes, created_by, idempotency_key, operation_group_id)
      values (v_org, v_roll.id, 'reservation', v_need.remaining, p_project_id, v_res_id,
              'حجز تلقائي بعد اعتماد العرض', v_uid,
              case when v_first then p_idempotency_key else gen_random_uuid() end, v_group);
      v_first := false;
      insert into core.audit_logs
        (organization_id, actor_id, action, entity, entity_id, summary, payload)
      values (v_org, v_uid, 'inventory.reserve', 'fabric_reservation', v_res_id::text,
              format('حجز تلقائي %s م من الرول %s', v_need.remaining, v_roll.code), v_payload);
      v_reserved_count := v_reserved_count + 1;
      continue;
    end if;

    select pg_catalog.round(coalesce(sum(b.available_m), 0), 3) into v_total
    from core.fabric_rolls r
    cross join lateral private.roll_balance(r.id) b
    where r.id = any(v_locked_rolls) and r.variant_id = v_need.variant_id
      and b.available_m > 0;

    -- الصنف كله أو لا شيء: الحجز الجزئي يقضم المتاح دون أن يُطلق
    -- الإنتاج ويُخفي حجم النقص الحقيقي
    if v_total < v_need.remaining then
      v_short := v_short || jsonb_build_object(
        'variant_id', v_need.variant_id, 'label', v_need.label,
        'required', v_need.required, 'reserved', v_need.reserved_m,
        'remaining', v_need.remaining, 'available', v_total);
      continue;
    end if;

    -- لا رول يكفي وحده والمخزون يكفي مجتمعًا: الأكبر فالأكبر - أقل عدد
    -- دفعات صبغ ممكن
    v_left := v_need.remaining;
    for v_roll in
      select r.id, r.code, b.available_m
      from core.fabric_rolls r
      cross join lateral private.roll_balance(r.id) b
      where r.id = any(v_locked_rolls) and r.variant_id = v_need.variant_id
        and b.available_m > 0
      order by b.available_m desc, r.id asc
    loop
      exit when v_left <= 0;
      v_take := pg_catalog.round(least(v_roll.available_m, v_left), 3);
      insert into core.fabric_reservations
        (organization_id, project_id, roll_id, quantity_m, created_by)
      values (v_org, p_project_id, v_roll.id, v_take, v_uid)
      returning id into v_res_id;
      insert into core.stock_movements
        (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
         notes, created_by, idempotency_key, operation_group_id)
      values (v_org, v_roll.id, 'reservation', v_take, p_project_id, v_res_id,
              'حجز تلقائي بعد اعتماد العرض', v_uid,
              case when v_first then p_idempotency_key else gen_random_uuid() end, v_group);
      v_first := false;
      insert into core.audit_logs
        (organization_id, actor_id, action, entity, entity_id, summary, payload)
      values (v_org, v_uid, 'inventory.reserve', 'fabric_reservation', v_res_id::text,
              format('حجز تلقائي %s م من الرول %s', v_take, v_roll.code), v_payload);
      v_reserved_count := v_reserved_count + 1;
      v_left := pg_catalog.round(v_left - v_take, 3);
    end loop;
    -- حزام أمان: المجموعة مجمدة وكتّابها يقفلون الرول أولًا فلا ينبغي أن
    -- يبقى شيء - وإن بقي فالإجهاض كله خير من حجز جزئي صامت
    if v_left > 0 then
      raise exception 'تغيّر المخزون أثناء الحجز - أعد المحاولة.' using errcode = 'BD409';
    end if;
  end loop;

  -- المرحلة تتقدم فقط حين لا ينقص شيء - والحكم من الحالة المقفولة نفسها
  if v_status = 'customer_approved' and v_short = '[]'::jsonb then
    perform set_config('app.rpc_context', 'on', true);
    update core.projects set status_code = 'fabric_allocated' where id = p_project_id;
    perform set_config('app.rpc_context', '', true);
    v_advanced := true;
  end if;

  v_result := jsonb_build_object(
    'project_id',      p_project_id,
    'reserved_count',  v_reserved_count,
    'short',           v_short,
    'status_advanced', v_advanced,
    'was_replayed',    false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'auto_reserve_for_project', p_project_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

-- ── الملكية والصلاحيات ──────────────────────────────────────────────────────
grant create on schema api to baytak_rpc_owner;

alter function api.auto_reserve_for_project(uuid, uuid, integer) owner to baytak_rpc_owner;

revoke create on schema api from baytak_rpc_owner;

revoke all on function api.auto_reserve_for_project(uuid, uuid, integer) from public, anon;

grant execute on function api.auto_reserve_for_project(uuid, uuid, integer) to authenticated;

notify pgrst, 'reload schema';
