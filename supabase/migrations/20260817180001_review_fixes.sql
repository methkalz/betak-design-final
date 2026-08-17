-- ════════════════════════════════════════════════════════════════════
-- إصلاحات المراجعة المهنية (17.8.2026)
--
-- ١) can_see_project ترى installer_id: المركّب كان أعمى عن مشروعه فتتعطل
--    رجل التركيب كلها.
-- ٢) save_window تحمل حُرّاس delete_window: لا يُغيَّر مقاسٌ ولا قماشٌ بعد
--    عرضٍ مقفول أو إنتاجٍ بدأ - العرض المعتمد لا يُصحَّح بنسخة جديدة.
-- ٣) advance_stage: التراجع عن «جاهز» يمحو تاريخ الإتمام ويُنزل حالة
--    المشروع معه بدل أن يتركه معلنًا جاهزيته.
-- ٤) assign_project_role: الأبناء قبل المشروع - كانت تعكس ترتيب الأقفال
--    فتفتح تعانقًا مع advance_stage وschedule_visit.
-- ٥) إعادة بحث الإعادة بعد نيل القفل في الدوال التي أغفلته، وقفل صفٍّ
--    لدوال المال الأربع (كانت بلا قفل فيصطدم المتزامن بقيد المفتاح).
-- ٦) محرّك التسعير: تقريبٌ إلى الأغورة **ثم** بترٌ إلى الشيكل - كما تفعل
--    حاسبة المالك والتطبيق. البتر في خطوة واحدة كان يُنقص شيكلًا من
--    تكلفة البند (وبأسعار المالك الحالية لا يمسّ سعر الزبون).
-- ٧) الزبائن: الميداني لا يكتب فوق زبونٍ لا مشروع له بين يديه، والأرشفة
--    للإدارة والمبيعات وحدهما.
--
-- الملكية والمنح لا تتغير: CREATE OR REPLACE يبقيها كما هي.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION private.can_see_project(p_org uuid, p_project uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case private.role_in(p_org)
    when 'admin' then true
    when 'sales' then true
    when 'tailor' then exists (
      select 1 from core.projects p
      where p.id = p_project
        and p.organization_id = p_org
        and p.tailor_id = (select auth.uid())
    )
    when 'field' then exists (
      select 1 from core.projects p
      where p.id = p_project
        and p.organization_id = p_org
        and (p.field_worker_id = (select auth.uid())
             -- المركّب يرى مشروعه: إسناد التركيب يكتب installer_id وحده،
             -- وإغفاله هنا كان يُعمي المركّب عن المشروع فتتعطل رجل التركيب
             or p.installer_id = (select auth.uid()))
    ) or exists (
      select 1 from core.field_visits v
      where v.project_id = p_project
        and v.organization_id = p_org
        and v.assignee_id = (select auth.uid())
    )
    else false
  end;
$function$;

CREATE OR REPLACE FUNCTION private.price_project_windows(p_org uuid, p_project uuid, p_ctx jsonb)
 RETURNS TABLE(window_id uuid, room_name text, window_name text, description text, width_cm numeric, height_cm numeric, running_meters numeric, quantity integer, category core.pricing_category, band core.height_band, unit_price_agorot bigint, line_total_agorot bigint, internal_cost_agorot bigint, fabric_meters numeric, lining_meters numeric, sort_order integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  w record;
  v_band core.height_band;
  v_cat core.pricing_category;
  v_price bigint;
  v_tailor bigint;
  v_track bigint;
  v_delivery bigint;
  v_mi bigint;
  v_lining_default bigint;
  v_rm numeric(12,3);
  v_fm numeric(12,3);
  v_lm numeric(12,3);
  v_fab_cost bigint;
  v_lin_cost bigint;
  v_cost_per_rm numeric;
  v_sort integer := 0;
  -- مكوّنات وصلت المحرك بعد المتجهات الذهبية: قيمها صفر في اللقطات القديمة
  -- (coalesce) فتبقى النسخ المقفلة والمتجهات كما هي حرفًا بحرف (§10)
  v_mt_cost bigint;
  v_mt_price bigint;
  v_motor_cost bigint;
  v_motor_price bigint;
  v_remote_cost bigint;
  v_remote_price bigint;
  v_lining_mul numeric(12,3);
  v_surcharge bigint;
  v_unit bigint;
  v_track_sel bigint;
  v_units integer;
  v_pw_price bigint;
  v_pw_cost bigint;
begin
  if p_ctx is null or p_ctx->'settings' is null or p_ctx->'rules' is null then
    raise exception 'سياق تسعير ناقص - المحرك يقرأ من اللقطة الملتقطة حصرًا.'
      using errcode = 'BD400';
  end if;

  v_track          := (p_ctx->'settings'->>'track_cost_per_meter_agorot')::bigint;
  v_delivery       := (p_ctx->'settings'->>'delivery_cost_per_meter_agorot')::bigint;
  v_mi             := (p_ctx->'settings'->>'measure_install_cost_per_meter_agorot')::bigint;
  v_lining_default := (p_ctx->'settings'->>'lining_cost_per_meter_agorot')::bigint;
  v_mt_cost      := coalesce((p_ctx->'settings'->>'motorized_track_cost_per_meter_agorot')::bigint, 0);
  v_mt_price     := coalesce((p_ctx->'settings'->>'motorized_track_price_per_meter_agorot')::bigint, 0);
  v_motor_cost   := coalesce((p_ctx->'settings'->>'motor_cost_agorot')::bigint, 0);
  v_motor_price  := coalesce((p_ctx->'settings'->>'motor_price_agorot')::bigint, 0);
  v_remote_cost  := coalesce((p_ctx->'settings'->>'remote_cost_agorot')::bigint, 0);
  v_remote_price := coalesce((p_ctx->'settings'->>'remote_price_agorot')::bigint, 0);

  for w in
    select win.id, win.name, win.width_cm, win.height_cm, win.quantity,
           win.fullness, win.has_lining, win.notes, win.track,
           win.fabric_variant_id,
           r.name as room_name,
           fv.cost_per_meter_agorot as fabric_cost,
           fp.kind as fabric_kind,
           lv.cost_per_meter_agorot as lining_variant_cost,
           lv.customer_surcharge_per_meter_agorot as lining_surcharge,
           lv.meters_per_running_meter as lining_per_rm
    from core.windows win
    join core.rooms r on r.id = win.room_id
    left join core.fabric_variants fv on fv.id = win.fabric_variant_id
    left join core.fabric_products fp on fp.id = fv.product_id
    left join core.fabric_variants lv on lv.id = win.lining_variant_id
    where win.project_id = p_project and win.organization_id = p_org
    order by r.created_at, win.created_at, win.id
  loop
    v_sort := v_sort + 1;

    if w.height_cm > 500 then
      raise exception 'الشباك "%" ارتفاعه % سم - فوق 500 سم يلزم تسعيرة خاصة من الأدمن، لا تسعير تلقائي.',
        w.name, w.height_cm using errcode = 'BD422';
    end if;
    if w.fabric_variant_id is null or w.fabric_cost is null then
      raise exception 'الشباك "%" بلا قماش محدد - اختر القماش قبل إنشاء العرض.',
        w.name using errcode = 'BD422';
    end if;

    -- يتغيّر السعر عند 320 سم (تصحيح المالك 10.8.2026 - كان 330)
    v_band := case when w.height_cm >= 320 then 'tall' else 'standard' end::core.height_band;
    v_cat  := case
                when w.fabric_kind = 'crepe' and w.has_lining     then 'crepe_with_lining'
                when w.fabric_kind = 'crepe' and not w.has_lining then 'crepe_without_lining'
                when w.has_lining                                 then 'other_with_lining'
                else 'other_without_lining'
              end::core.pricing_category;

    select (r->>'customer_price_per_meter_agorot')::bigint,
           (r->>'tailor_cost_per_meter_agorot')::bigint
      into v_price, v_tailor
    from jsonb_array_elements(p_ctx->'rules') r
    where r->>'band' = v_band::text and r->>'category' = v_cat::text;
    if v_price is null then
      raise exception 'لا قاعدة تسعير للفئة % والارتفاع % - راجع إعدادات التسعير.',
        v_cat, v_band using errcode = 'BD422';
    end if;

    v_rm := pg_catalog.round(w.width_cm / 100 * w.quantity, 3);
    v_fm := pg_catalog.round(v_rm * w.fullness, 3);
    -- البطانة تستهلك بنسبتها هي (70% ← 3، 100% ← 1.5)؛ الصفر يعني «اتبع
    -- المضاعف» - وهو السلوك الذي قامت عليه المتجهات الذهبية
    v_lining_mul := case when w.lining_per_rm is not null and w.lining_per_rm > 0
                         then w.lining_per_rm else w.fullness end;
    v_lm := case when w.has_lining then pg_catalog.round(v_rm * v_lining_mul, 3) else 0 end;

    v_fab_cost := w.fabric_cost;
    v_lin_cost := coalesce(w.lining_variant_cost, v_lining_default);
    -- زيادة البطانة المختارة تُضاف إلى سعر المتر الطولي (البطانة 70% داخلة
    -- في السعر فزيادتها صفر، و100% تزيده بما وضعه الأدمن على اللون)
    v_surcharge := case when w.has_lining then coalesce(w.lining_surcharge, 0) else 0 end;

    -- المسار الكهربائي: سعرٌ مستقل للمتر، وماتور وجهاز تحكم لكل ستارة لا
    -- لكل متر - ماتور واحد يكفي ستارة طولها متر أو عشرة. العادي داخل في
    -- سعر القماش: تكلفة على المحل بلا زيادة على الزبون.
    v_units := greatest(1, w.quantity);
    if w.track = 'motorized' then
      v_track_sel := v_mt_cost;
      v_unit      := v_price + v_surcharge + v_mt_price;
      v_pw_price  := (v_motor_price + v_remote_price) * v_units;
      v_pw_cost   := (v_motor_cost + v_remote_cost) * v_units;
    else
      v_track_sel := v_track;
      v_unit      := v_price + v_surcharge;
      v_pw_price  := 0;
      v_pw_cost   := 0;
    end if;

    v_cost_per_rm :=
        v_fab_cost * w.fullness
      + case when w.has_lining then v_lin_cost * v_lining_mul else 0 end
      + v_tailor + v_track_sel + v_delivery + v_mi;

    window_id            := w.id;
    room_name            := w.room_name;
    window_name          := w.name;
    description          := w.notes;
    width_cm             := w.width_cm;
    height_cm            := w.height_cm;
    running_meters       := v_rm;
    quantity             := w.quantity;
    category             := v_cat;
    band                 := v_band;
    unit_price_agorot    := v_unit;
    -- ★ إسقاط الأغوروت: شيكل صحيح لكل بند، ومبالغ الستارة (ماتور وجهاز
    -- تحكم) صحيحة أصلًا فتُضاف بعد الإسقاط - مرآة lineArithmetic حرفًا.
    --
    -- خطوتان لا واحدة: تقريبٌ إلى الأغورة الأقرب ثم بترٌ إلى الشيكل - كما
    -- تفعل حاسبة المالك (tools/price-calculator/app.js) والتطبيق. البتر
    -- المباشر كان يُنقص شيكلًا كلما وقع الحاصل تحت الشيكل بكسر أغورة،
    -- فيرى الزبون رقمًا في المعاينة ويحمل العرض المخزَّن رقمًا أقلّ.
    line_total_agorot    := (pg_catalog.floor(pg_catalog.round(v_unit * v_rm) / 100) * 100)::bigint
                            + v_pw_price;
    internal_cost_agorot := (pg_catalog.floor(pg_catalog.round(v_cost_per_rm * v_rm) / 100) * 100)::bigint
                            + v_pw_cost;
    fabric_meters        := v_fm;
    lining_meters        := v_lm;
    sort_order           := v_sort;
    return next;
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION private.quotation_content_canonical(p_version_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select 'fp1'
    || '|' || coalesce(v.pricing_context->>'currency', 'null')
    || '|' || coalesce(v.pricing_context->>'calculation_version', 'null')
    || '|' || coalesce(v.pricing_context->>'vat_mode', 'null')
    || '|' || coalesce(v.pricing_context->>'vat_percent', 'null')
    || '|' || v.discount_percent::text
    || '|' || pg_catalog.to_char(v.valid_until at time zone 'UTC',
                                 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    || '|' || encode(extensions.digest(v.pricing_context::text, 'sha256'), 'hex')
    || '|' || coalesce((
         select string_agg(
                  lower(i.id::text)
                  || '|' || i.width_cm::text
                  || '|' || i.height_cm::text
                  || '|' || i.running_meters::text
                  || '|' || i.quantity::text
                  || '|' || i.category::text
                  || '|' || i.band::text
                  || '|' || i.unit_price_agorot::text
                  || '|' || i.line_total_agorot::text
                  || '|' || i.internal_cost_agorot::text
                  || '|' || i.fabric_meters::text
                  || '|' || i.lining_meters::text,
                  '||' order by i.sort_order, i.id)
         from core.quotation_items i
         where i.version_id = v.id
       ), '')
  from core.quotation_versions v
  where v.id = p_version_id
$function$;

CREATE OR REPLACE FUNCTION private.version_content_fingerprint(p_version_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select encode(extensions.digest(
           private.quotation_content_canonical(p_version_id), 'sha256'), 'hex')
$function$;

CREATE OR REPLACE FUNCTION api.save_customer(p_full_name text, p_phone text, p_idempotency_key uuid, p_customer_id uuid DEFAULT NULL::uuid, p_city text DEFAULT ''::text, p_address text DEFAULT ''::text, p_notes text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_name text; v_phone text;
  v_customer_id uuid; v_created boolean := false;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  -- كيان جذر: المعرض من عضوية المستدعي لا من كيانٍ سابق
  select om.organization_id into v_org
  from core.organization_members om
  where om.user_id = v_uid and om.is_active
  limit 1;
  if v_org is null then
    raise exception 'حسابك غير مربوط بأي معرض نشط - راجع الأدمن.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales','field']::core.app_role[]) then
    raise exception 'دورك لا يسمح بإدارة الزبائن.' using errcode = 'BD403';
  end if;
  -- الميداني يُنشئ زبونًا يلقاه في البيت، لكنه لا يكتب فوق زبونٍ قائم إلا
  -- إن كان له مشروعٌ يراه: بدون هذا كان يستطيع محو اسم أي زبون في المعرض
  -- وهاتفه (الحقول تُستبدل كلها لا تُدمج)
  if p_customer_id is not null
     and not private.has_role(v_org, array['admin','sales']::core.app_role[])
     and not exists (
       select 1 from core.projects p
       where p.customer_id = p_customer_id
         and p.organization_id = v_org
         and private.can_see_project(v_org, p.id))
  then
    raise exception 'لا تعدّل زبونًا ليس له مشروع بين يديك.' using errcode = 'BD403';
  end if;

  v_name := pg_catalog.btrim(coalesce(p_full_name, ''));
  if length(v_name) < 3 then
    raise exception 'اسم الزبون قصير جدًا.' using errcode = 'BD400';
  end if;
  v_phone := pg_catalog.regexp_replace(coalesce(p_phone, ''), '\s', '', 'g');
  if v_phone !~ '^0\d{1,2}-?\d{7}$' then
    raise exception 'رقم الهاتف غير صالح (مثال: 052-6444414).' using errcode = 'BD400';
  end if;

  v_payload := jsonb_build_object(
    'op', 'save_customer', 'user_id', v_uid,
    'customer_id', p_customer_id, 'full_name', v_name, 'phone', v_phone,
    'city', coalesce(p_city, ''), 'address', coalesce(p_address, ''),
    'notes', coalesce(p_notes, ''));

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  if p_customer_id is null then
    insert into core.customers (organization_id, full_name, phone, city, address, notes)
    values (v_org, v_name, v_phone,
            pg_catalog.btrim(coalesce(p_city, '')),
            pg_catalog.btrim(coalesce(p_address, '')),
            pg_catalog.btrim(coalesce(p_notes, '')))
    returning id into v_customer_id;
    v_created := true;
  else
    select c.id into v_customer_id from core.customers c
    where c.id = p_customer_id and c.organization_id = v_org
    for update;
    if v_customer_id is null then
      raise exception 'الزبون غير موجود.' using errcode = 'BD404';
    end if;
    update core.customers
       set full_name = v_name, phone = v_phone,
           city = pg_catalog.btrim(coalesce(p_city, '')),
           address = pg_catalog.btrim(coalesce(p_address, '')),
           notes = pg_catalog.btrim(coalesce(p_notes, ''))
     where id = v_customer_id;
  end if;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid,
          case when v_created then 'customer.create' else 'customer.update' end,
          'customer', v_customer_id::text,
          case when v_created then format('إنشاء زبون %s', v_name)
               else 'تحديث بيانات الزبون' end,
          v_payload);

  v_result := jsonb_build_object(
    'customer_id', v_customer_id, 'created', v_created, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'save_customer', v_customer_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.archive_customer(p_customer_id uuid, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_name text;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  select c.organization_id, c.full_name into v_org, v_name
  from core.customers c where c.id = p_customer_id;
  if v_org is null then
    raise exception 'الزبون غير موجود.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  -- الأرشفة قرار إداري لا ميداني: تُخرج الزبون من كل القوائم
  if not private.has_role(v_org, array['admin','sales']::core.app_role[]) then
    raise exception 'أرشفة الزبائن صلاحية الإدارة والمبيعات.' using errcode = 'BD403';
  end if;

  v_payload := jsonb_build_object(
    'op', 'archive_customer', 'user_id', v_uid, 'customer_id', p_customer_id);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- أرشفة لا حذف: يخرج من القوائم ودفاتره باقية (قاعدة «لا حذف في الدفاتر»)
  update core.customers set archived_at = coalesce(archived_at, now())
   where id = p_customer_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'customer.archive', 'customer', p_customer_id::text,
          format('أرشفة الزبون %s (بدون حذف فعلي)', v_name), v_payload);

  v_result := jsonb_build_object('customer_id', p_customer_id, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'archive_customer', p_customer_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.assign_project_role(p_project_id uuid, p_worker_id uuid, p_kind text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_code text; v_title text;
  v_status text; v_measurement_date timestamptz;
  v_wanted core.app_role; v_visit_id uuid; v_label text;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;
  if p_kind not in ('measurement', 'installation', 'tailor') then
    raise exception 'نوع إسناد غير معروف: %', p_kind using errcode = 'BD400';
  end if;

  select p.organization_id, p.code, p.title, p.status_code, p.measurement_date
    into v_org, v_code, v_title, v_status, v_measurement_date
  from core.projects p where p.id = p_project_id and p.archived_at is null;
  if v_org is null then
    raise exception 'المشروع غير موجود.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  -- الإسناد صريح بيد الأدمن (M16)
  if not private.has_role(v_org, array['admin']::core.app_role[]) then
    raise exception 'إسناد الأدوار صلاحية الأدمن وحده.' using errcode = 'BD403';
  end if;

  v_wanted := case when p_kind = 'tailor' then 'tailor' else 'field' end::core.app_role;
  if not exists (select 1 from core.organization_members om
                 where om.organization_id = v_org and om.user_id = p_worker_id
                   and om.role = v_wanted and om.is_active) then
    raise exception '%', case when p_kind = 'tailor' then 'اختر خياطًا مفعَّلًا.'
                              else 'اختر عاملًا ميدانيًا مفعَّلًا.' end
      using errcode = 'BD422';
  end if;

  v_payload := jsonb_build_object(
    'op', 'assign_project_role', 'user_id', v_uid,
    'project_id', p_project_id, 'worker_id', p_worker_id, 'kind', p_kind);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- ترتيب الأقفال: الأبناء أولًا والمشروع آخرًا - عكسُه هنا كان يفتح
  -- تعانقًا مع advance_stage وschedule_visit اللتين تقفلان الابن ثم المشروع
  perform 1 from core.tailor_assignments
   where project_id = p_project_id order by id for update;
  perform 1 from core.field_visits
   where project_id = p_project_id order by id for update;
  perform 1 from core.projects where id = p_project_id for update;

  -- إعادة البحث بعد نيل الأقفال: المتزامن الثاني يجد عملية الأول مسجلة
  -- فيستعيدها بدل أن يكرّر الإسناد ويصطدم بقيد المفتاح
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  if p_kind = 'tailor' then
    update core.projects set tailor_id = p_worker_id where id = p_project_id;
    -- الورشة المفتوحة تتبع خياطها الجديد وإلا بقيت باسم من لم يعد مسؤولًا
    update core.tailor_assignments set tailor_id = p_worker_id
     where project_id = p_project_id and stage <> 'ready';
  elsif p_kind = 'measurement' then
    -- المرآة القديمة field_worker_id تتبع القائس: عليها سياسات الرؤية
    update core.projects
       set measurement_worker_id = p_worker_id, field_worker_id = p_worker_id
     where id = p_project_id;
    update core.field_visits set assignee_id = p_worker_id
     where project_id = p_project_id and type = 'measurement' and status <> 'completed';
    if not found and v_measurement_date is not null
       and v_status in ('new_request', 'awaiting_measurement') then
      insert into core.field_visits
        (organization_id, project_id, assignee_id, type, status, scheduled_at)
      values (v_org, p_project_id, p_worker_id, 'measurement', 'scheduled', v_measurement_date)
      returning id into v_visit_id;
    end if;
  else
    update core.projects set installer_id = p_worker_id where id = p_project_id;
    update core.field_visits set assignee_id = p_worker_id
     where project_id = p_project_id and type = 'installation' and status <> 'completed';
  end if;

  v_label := case p_kind when 'tailor' then 'الخياطة'
                         when 'measurement' then 'القياس'
                         else 'التركيب' end;
  insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
  values (v_org, p_worker_id,
          case when p_kind = 'tailor' then 'tailor_assignment' else 'visit_assigned' end::core.notification_kind,
          format('أُسند إليك %s', v_label),
          format('%s - %s', v_title, v_code), '/project/' || p_project_id::text);

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'project.assign', 'project', p_project_id::text,
          format('إسناد %s في %s', v_label, v_code), v_payload);

  v_result := jsonb_build_object(
    'project_id', p_project_id, 'kind', p_kind, 'worker_id', p_worker_id,
    'visit_id', v_visit_id, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'assign_project_role', p_project_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.save_window(p_project_id uuid, p_room_id uuid, p_width_cm numeric, p_height_cm numeric, p_fabric_variant_id uuid, p_idempotency_key uuid, p_window_id uuid DEFAULT NULL::uuid, p_name text DEFAULT ''::text, p_has_lining boolean DEFAULT false, p_lining_variant_id uuid DEFAULT NULL::uuid, p_track text DEFAULT 'ceiling_rail'::text, p_fullness numeric DEFAULT 3, p_quantity integer DEFAULT 1, p_notes text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_window_id uuid; v_status text;
  v_created boolean := false; v_name text; v_track text;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  select p.organization_id, p.status_code into v_org, v_status
  from core.projects p where p.id = p_project_id and p.archived_at is null;
  if v_org is null then
    raise exception 'المشروع غير موجود.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales','field']::core.app_role[]) then
    raise exception 'دورك لا يسمح بتسجيل القياسات.' using errcode = 'BD403';
  end if;
  -- حدود الرؤية نفسها التي كانت على سياسات الكتابة المباشرة: الميداني
  -- يكتب في مشاريعه هو (قائسًا مُسندًا أو صاحبَ زيارة) لا في مشاريع غيره
  if not private.can_see_project(v_org, p_project_id) then
    raise exception 'هذا المشروع خارج نطاق عملك.' using errcode = 'BD403';
  end if;

  if not exists (select 1 from core.rooms r
                 where r.id = p_room_id and r.project_id = p_project_id) then
    raise exception 'الغرفة غير موجودة في هذا المشروع.' using errcode = 'BD404';
  end if;
  if not (p_width_cm > 0 and p_height_cm > 0) then
    raise exception 'العرض والارتفاع يجب أن يكونا أكبر من صفر.' using errcode = 'BD400';
  end if;
  if p_height_cm > 500 then
    raise exception 'الارتفاع أكبر من 500 سم - يحتاج تسعيرة خاصة من الأدمن.'
      using errcode = 'BD400';
  end if;
  if p_fullness < 1.5 or p_fullness > 4 then
    raise exception 'المضاعف يجب أن يكون بين 1.5 و 4.' using errcode = 'BD400';
  end if;
  if p_quantity < 1 or p_quantity > 20 then
    raise exception 'عدد القطع يجب أن يكون بين 1 و20.' using errcode = 'BD400';
  end if;
  if p_track not in ('standard', 'ceiling_rail', 'wall_rod', 'motorized', 'double_rail') then
    raise exception 'نوع مسار غير معروف.' using errcode = 'BD400';
  end if;
  -- مفردة التطبيق «عادي» تُروى إلى قيمة المخطط القديمة - قرار المالك
  -- اختزل المسارات إلى عادي/كهربائي والمخطط سبقه بأربع قيم
  v_track := case when p_track = 'standard' then 'ceiling_rail' else p_track end;
  -- القماش لم يعد اختياريًا: عليه يقوم السعر والحجز التلقائي
  if p_fabric_variant_id is null or not exists (
      select 1 from core.fabric_variants v
      where v.id = p_fabric_variant_id and v.organization_id = v_org
        and v.archived_at is null) then
    raise exception 'اختر القماش - عليه يقوم السعر والحجز التلقائي.' using errcode = 'BD400';
  end if;
  if p_has_lining and (p_lining_variant_id is null or not exists (
      select 1 from core.fabric_variants v
      where v.id = p_lining_variant_id and v.organization_id = v_org
        and v.archived_at is null)) then
    raise exception 'اخترت «مع بطانة» - فحدّد قماش البطانة أو ألغِ الخيار.'
      using errcode = 'BD400';
  end if;

  v_name := coalesce(nullif(pg_catalog.btrim(coalesce(p_name, '')), ''), 'شباك');

  v_payload := jsonb_build_object(
    'op', 'save_window', 'user_id', v_uid,
    'window_id', p_window_id, 'project_id', p_project_id, 'room_id', p_room_id,
    'name', v_name, 'width_cm', p_width_cm, 'height_cm', p_height_cm,
    'has_lining', p_has_lining, 'track', p_track, 'fullness', p_fullness,
    'fabric_variant_id', p_fabric_variant_id, 'lining_variant_id', p_lining_variant_id,
    'quantity', p_quantity, 'notes', coalesce(p_notes, ''));

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  if p_window_id is null then
    insert into core.windows
      (organization_id, project_id, room_id, name, width_cm, height_cm,
       has_lining, track, fullness, fabric_variant_id, lining_variant_id,
       quantity, notes, measured_at, measured_by)
    values
      (v_org, p_project_id, p_room_id, v_name, p_width_cm, p_height_cm,
       p_has_lining, v_track::core.track_type, p_fullness, p_fabric_variant_id,
       case when p_has_lining then p_lining_variant_id else null end,
       p_quantity, pg_catalog.btrim(coalesce(p_notes, '')), now(), v_uid)
    returning id into v_window_id;
    v_created := true;
  else
    select w.id into v_window_id from core.windows w
    where w.id = p_window_id and w.project_id = p_project_id
    for update;
    if v_window_id is null then
      raise exception 'الشباك غير موجود.' using errcode = 'BD404';
    end if;
    -- ما يُحرّم حذفه يُحرّم تعديل مقاسه: العرض المقفول يسعّر مقاسًا، فلو
    -- تغيّر بعده لسعّرنا ثلاثة أمتار وقصصنا خمسة - والنسخة المعتمدة لا
    -- تُصحَّح لأن create_quotation_version ترفض نسخةً بعد الاعتماد
    if exists (select 1 from core.fabric_usage u where u.window_id = v_window_id) then
      raise exception 'الشباك مسجَّل الإنجاز - لا يُعدَّل مقاسه بعد بدء الإنتاج.'
        using errcode = 'BD409';
    end if;
    if exists (select 1 from core.quotation_items i
               join core.quotation_versions v on v.id = i.version_id
               where i.window_id = v_window_id and v.locked) then
      raise exception 'الشباك ضمن عرض سعرٍ مُرسَل - لا يُغيَّر مقاسه ولا قماشه بعد الإرسال.'
        using errcode = 'BD409';
    end if;
    -- وتغيير القماش بعد الحجز ييتّم الحجز: complete_window تبحث عن حجزٍ
    -- بصنف الشباك الحالي فلا تجده، فيتجمّد أمر الإنتاج بلا مخرج
    if exists (select 1 from core.fabric_reservations r
               join core.fabric_rolls fr on fr.id = r.roll_id
               where r.project_id = p_project_id and r.status <> 'released'
                 and fr.variant_id is distinct from p_fabric_variant_id
                 and exists (select 1 from core.windows w2
                             where w2.id = v_window_id
                               and w2.fabric_variant_id is distinct from p_fabric_variant_id))
    then
      raise exception 'القماش محجوز لهذا المشروع - فُكّ الحجز قبل تغيير الصنف.'
        using errcode = 'BD409';
    end if;
    update core.windows
       set room_id = p_room_id, name = v_name,
           width_cm = p_width_cm, height_cm = p_height_cm,
           has_lining = p_has_lining, track = v_track::core.track_type,
           fullness = p_fullness, fabric_variant_id = p_fabric_variant_id,
           lining_variant_id = case when p_has_lining then p_lining_variant_id else null end,
           quantity = p_quantity, notes = pg_catalog.btrim(coalesce(p_notes, '')),
           measured_at = now(), measured_by = v_uid
     where id = v_window_id;
  end if;

  -- أول قياس يحرّك المشروع «تم القياس» (مرآة التطبيق)
  select p.status_code into v_status
  from core.projects p where p.id = p_project_id for update;
  if v_status in ('new_request', 'awaiting_measurement') then
    perform set_config('app.rpc_context', 'on', true);
    update core.projects set status_code = 'measured' where id = p_project_id;
    perform set_config('app.rpc_context', '', true);
  end if;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'window.save', 'window', v_window_id::text,
          format('حفظ قياس %s', v_name), v_payload);

  v_result := jsonb_build_object(
    'window_id', v_window_id, 'created', v_created, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'save_window', v_window_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.schedule_visit(p_project_id uuid, p_assignee_id uuid, p_type text, p_scheduled_at timestamp with time zone, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_code text; v_title text; v_visit_id uuid;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;
  if p_type not in ('measurement', 'installation') then
    raise exception 'نوع زيارة غير معروف.' using errcode = 'BD400';
  end if;
  if p_scheduled_at is null then
    raise exception 'موعد الزيارة إلزامي.' using errcode = 'BD400';
  end if;

  select p.organization_id, p.code, p.title into v_org, v_code, v_title
  from core.projects p where p.id = p_project_id and p.archived_at is null;
  if v_org is null then
    raise exception 'المشروع غير موجود.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','field']::core.app_role[]) then
    raise exception 'دورك لا يسمح بجدولة الزيارات.' using errcode = 'BD403';
  end if;
  if not private.can_see_project(v_org, p_project_id) then
    raise exception 'هذا المشروع خارج نطاق عملك.' using errcode = 'BD403';
  end if;
  if not exists (select 1 from core.organization_members om
                 where om.organization_id = v_org and om.user_id = p_assignee_id
                   and om.role = 'field' and om.is_active) then
    raise exception 'اختر عاملًا ميدانيًا مفعَّلًا.' using errcode = 'BD422';
  end if;

  v_payload := jsonb_build_object(
    'op', 'schedule_visit', 'user_id', v_uid,
    'project_id', p_project_id, 'assignee_id', p_assignee_id,
    'type', p_type, 'scheduled_at', p_scheduled_at);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- زيارة واحدة مفتوحة من كل نوع لكل مشروع - تحت قفل المشروع فلا يمرّ
  -- متزامنان من الفحص معًا
  perform 1 from core.projects where id = p_project_id for update;

  -- إعادة البحث بعد نيل القفل: المتزامن الثاني ينتظر هنا ثم يجد عملية
  -- الأول مسجلة فيستعيدها بدل أن يكرّر الكتابة أو يصطدم بقيد المفتاح
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;
  if exists (select 1 from core.field_visits v
             where v.project_id = p_project_id and v.type = p_type::core.visit_type
               and v.status <> 'completed') then
    raise exception 'توجد زيارة من هذا النوع مجدولة بالفعل لهذا المشروع.'
      using errcode = 'BD409';
  end if;

  insert into core.field_visits
    (organization_id, project_id, assignee_id, type, status, scheduled_at)
  values (v_org, p_project_id, p_assignee_id, p_type::core.visit_type,
          'scheduled', p_scheduled_at)
  returning id into v_visit_id;

  -- موعد المشروع يتبع زيارته (كما في التطبيق)
  if p_type = 'installation' then
    update core.projects set installation_date = p_scheduled_at where id = p_project_id;
  else
    update core.projects set measurement_date = p_scheduled_at where id = p_project_id;
  end if;

  insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
  values (v_org, p_assignee_id, 'visit_assigned',
          case when p_type = 'measurement' then 'زيارة قياس جديدة'
               else 'زيارة تركيب جديدة' end,
          format('%s - %s', v_title, v_code), '/visit/' || v_visit_id::text);

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'visit.schedule', 'field_visit', v_visit_id::text,
          'جدولة زيارة ميدانية', v_payload);

  v_result := jsonb_build_object(
    'visit_id', v_visit_id, 'type', p_type, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'schedule_visit', v_visit_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.assign_tailor(p_project_id uuid, p_tailor_id uuid, p_idempotency_key uuid, p_instructions text DEFAULT ''::text, p_due_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_code text; v_title text;
  v_assignment_id uuid;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  select p.organization_id, p.code, p.title into v_org, v_code, v_title
  from core.projects p where p.id = p_project_id and p.archived_at is null;
  if v_org is null then
    raise exception 'المشروع غير موجود.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  -- فتح أوامر الإنتاج قرار إداري (M16)
  if not private.has_role(v_org, array['admin']::core.app_role[]) then
    raise exception 'فتح أوامر الإنتاج صلاحية الأدمن وحده.' using errcode = 'BD403';
  end if;
  if not exists (select 1 from core.organization_members om
                 where om.organization_id = v_org and om.user_id = p_tailor_id
                   and om.role = 'tailor' and om.is_active) then
    raise exception 'اختر خياطًا مفعَّلًا.' using errcode = 'BD422';
  end if;

  v_payload := jsonb_build_object(
    'op', 'assign_tailor', 'user_id', v_uid,
    'project_id', p_project_id, 'tailor_id', p_tailor_id,
    'instructions', coalesce(p_instructions, ''), 'due_date', p_due_date);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- أمر إنتاج واحد لكل مشروع (قيد الجدول الفريد) - تحت قفل المشروع،
  -- وبرسالتين صادقتين: المفتوح يُدار، والمقفل لا يتكرر - تبديل الخياط
  -- عبر إسناد الأدوار لا بأمر جديد
  perform 1 from core.projects where id = p_project_id for update;

  -- إعادة البحث بعد نيل القفل: المتزامن الثاني ينتظر هنا ثم يجد عملية
  -- الأول مسجلة فيستعيدها بدل أن يكرّر الكتابة أو يصطدم بقيد المفتاح
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;
  if exists (select 1 from core.tailor_assignments a
             where a.project_id = p_project_id and a.stage <> 'ready') then
    raise exception 'يوجد أمر إنتاج مفتوح لهذا المشروع - تبديل خياطه عبر إسناد الأدوار.'
      using errcode = 'BD409';
  end if;
  if exists (select 1 from core.tailor_assignments a
             where a.project_id = p_project_id) then
    raise exception 'لهذا المشروع أمر إنتاج مُقفل - المشروع الواحد أمرٌ واحد.'
      using errcode = 'BD409';
  end if;

  insert into core.tailor_assignments
    (organization_id, project_id, tailor_id, instructions, due_date)
  values (v_org, p_project_id, p_tailor_id,
          pg_catalog.btrim(coalesce(p_instructions, '')), p_due_date)
  returning id into v_assignment_id;

  perform set_config('app.rpc_context', 'on', true);
  update core.projects
     set tailor_id = p_tailor_id, status_code = 'with_tailor'
   where id = p_project_id;
  perform set_config('app.rpc_context', '', true);

  insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
  values (v_org, p_tailor_id, 'tailor_assignment', 'مشروع جديد للخياطة',
          format('%s - %s', v_title, v_code), '/tailor/' || v_assignment_id::text);

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'tailor.assign', 'tailor_assignment', v_assignment_id::text,
          'إسناد مشروع للخياط', v_payload);

  v_result := jsonb_build_object(
    'assignment_id', v_assignment_id, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'assign_tailor', v_assignment_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.advance_stage(p_assignment_id uuid, p_stage text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_project uuid; v_tailor uuid;
  v_current core.tailor_stage; v_is_admin boolean;
  v_stages text[] := array['received','cutting','sewing','ironing','qc','ready'];
  v_from integer; v_to integer; v_left integer;
  v_prj record; v_tailor_name text;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  v_to := pg_catalog.array_position(v_stages, p_stage);
  if v_to is null then
    raise exception 'مرحلة غير معروفة.' using errcode = 'BD400';
  end if;

  select a.organization_id, a.project_id, a.tailor_id, a.stage
    into v_org, v_project, v_tailor, v_current
  from core.tailor_assignments a where a.id = p_assignment_id;
  if v_org is null then
    raise exception 'أمر الإنتاج غير موجود.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  -- المرحلة يقدّمها الأدمن أو خياط الأمر نفسه
  v_is_admin := private.has_role(v_org, array['admin']::core.app_role[]);
  if not (v_is_admin
          or (private.has_role(v_org, array['tailor']::core.app_role[])
              and v_tailor = v_uid)) then
    raise exception 'تقدّم المراحل للأدمن أو خياط الأمر نفسه.' using errcode = 'BD403';
  end if;

  v_payload := jsonb_build_object(
    'op', 'advance_stage', 'user_id', v_uid,
    'assignment_id', p_assignment_id, 'stage', p_stage);

  -- بحث الإعادة قبل حُرّاس الحالة: الجواب الضائع نتيجةٌ مخزونة لا خطأ
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- الأقفال: الأمر ثم المشروع أخيرًا
  select a.stage into v_current from core.tailor_assignments a
  where a.id = p_assignment_id for update;
  select p.* into v_prj from core.projects p where p.id = v_project for update;

  -- إعادة البحث بعد نيل القفل: المتزامن الثاني ينتظر هنا ثم يجد عملية
  -- الأول مسجلة فيستعيدها بدل أن يكرّر الكتابة أو يصطدم بقيد المفتاح
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- خطوة واحدة في الاتجاهين لا قفزًا: القفز يترك مراحل بلا توقيت في
  -- السجل. والرجوع خطوة مسموح لأن الضغطة الخاطئة تقع.
  v_from := pg_catalog.array_position(v_stages, v_current::text);
  if pg_catalog.abs(v_to - v_from) <> 1 then
    raise exception 'المراحل تتقدّم خطوة واحدة في كل مرة.' using errcode = 'BD409';
  end if;

  -- «جاهز» يُغلق الأمر ويُطلق التركيب، فلا يصحّ قبل أن يُنهى كل شباك -
  -- وتأكيد الإنهاء هو نفسه تسجيل الاستهلاك، فلا يُقفل أمرٌ وقماشه محجوز
  if p_stage = 'ready' then
    select count(*) into v_left
    from core.windows w
    where w.project_id = v_project
      and not exists (select 1 from core.fabric_usage u where u.window_id = w.id);
    if v_left > 0 then
      raise exception 'بقي % شباك بلا تأكيد إنهاء - أكّدها قبل الإقفال.', v_left
        using errcode = 'BD409';
    end if;
  end if;

  update core.tailor_assignments
     set stage = p_stage::core.tailor_stage,
         started_at = coalesce(started_at, now()),
         -- التراجع خطوةً يمحو الإتمام: تركُه يجعل أمرًا عاد إلى الكيّ
         -- يبدو منجزًا في كل تقرير يقرأ completed_at
         completed_at = case when p_stage = 'ready' then now() else null end,
         stage_history = stage_history
           || jsonb_build_object('stage', p_stage, 'at', now())
   where id = p_assignment_id;

  if p_stage = 'ready' then
    perform set_config('app.rpc_context', 'on', true);
    update core.projects set status_code = 'ready_for_install' where id = v_project;
    perform set_config('app.rpc_context', '', true);

    -- المركّب إن أُسند وإلا فالقائس، والإدارة تعلم تلقائيًا (M18)
    if coalesce(v_prj.installer_id, v_prj.measurement_worker_id) is not null then
      insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
      values (v_org, coalesce(v_prj.installer_id, v_prj.measurement_worker_id),
              'ready_for_install', 'جاهز للتركيب',
              format('%s - حدد موعد التركيب.', v_prj.title),
              '/project/' || v_project::text);
    end if;
    select p.full_name into v_tailor_name from core.profiles p where p.id = v_tailor;
    insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
    select v_org, om.user_id, 'ready_for_install', 'الورشة جاهزة',
           format('%s أنهى %s - جاهز للتركيب.',
                  coalesce(v_tailor_name, 'الخياط'), v_prj.title),
           '/project/' || v_project::text
    from core.organization_members om
    where om.organization_id = v_org and om.role = 'admin' and om.is_active;
  elsif v_prj.status_code in ('fabric_allocated', 'ready_for_install') then
    -- ومن 'ready_for_install' يعود كذلك: التراجع عن «جاهز» كان يترك
    -- المشروع معلنًا جاهزيته بينما الأمر عاد إلى الخياطة
    perform set_config('app.rpc_context', 'on', true);
    update core.projects set status_code = 'with_tailor' where id = v_project;
    perform set_config('app.rpc_context', '', true);
  end if;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'production.stage', 'tailor_assignment', p_assignment_id::text,
          format('تحديث مرحلة الإنتاج إلى: %s', p_stage), v_payload);

  v_result := jsonb_build_object(
    'assignment_id', p_assignment_id, 'stage', p_stage, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'advance_stage', p_assignment_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.record_payment(p_project_id uuid, p_amount_agorot bigint, p_kind text, p_method text, p_idempotency_key uuid, p_reference text DEFAULT ''::text, p_note text DEFAULT ''::text, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_code text; v_payment_id uuid;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;
  if p_kind not in ('deposit', 'milestone', 'final') then
    raise exception 'نوع دفعة غير معروف - العكس له مساره الخاص.' using errcode = 'BD400';
  end if;
  if p_method not in ('cash', 'transfer', 'check', 'card') then
    raise exception 'طريقة دفع غير معروفة.' using errcode = 'BD400';
  end if;
  if p_amount_agorot is null or p_amount_agorot <= 0 then
    raise exception 'المبلغ يجب أن يكون أكبر من صفر.' using errcode = 'BD400';
  end if;
  if p_amount_agorot % 100 <> 0 then
    raise exception 'المبلغ بالشيكل الصحيح - لا أغورة.' using errcode = 'BD400';
  end if;

  select p.organization_id, p.code into v_org, v_code
  from core.projects p where p.id = p_project_id and p.archived_at is null;
  if v_org is null then
    raise exception 'المشروع غير موجود.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales']::core.app_role[]) then
    raise exception 'دورك لا يسمح بتسجيل الدفعات.' using errcode = 'BD403';
  end if;

  v_payload := jsonb_build_object(
    'op', 'record_payment', 'user_id', v_uid,
    'project_id', p_project_id, 'amount_agorot', p_amount_agorot,
    'kind', p_kind, 'method', p_method, 'reference', coalesce(p_reference, ''),
    'note', coalesce(p_note, ''), 'due_at', p_due_at);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- لا دفعة بلا عرض معتمد (DECISIONS §11): بدونه لا مبلغ متفق عليه تُقاس
  -- عليه الدفعة، فتظهر مستحقات وأرصدة لا أصل لها
  if not exists (
    select 1 from core.quotation_versions v
    join core.quotations q on q.id = v.quotation_id
    where q.project_id = p_project_id and v.status = 'approved'
  ) then
    raise exception 'لا يمكن تسجيل دفعة قبل اعتماد الزبون لعرض السعر - لا يوجد مبلغ متفق عليه بعد.'
      using errcode = 'BD409';
  end if;

  perform 1 from core.projects where id = p_project_id for update;

  -- إعادة البحث بعد القفل: المتزامن الثاني ينتظر هنا فيجد عملية الأول
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  insert into core.payments
    (organization_id, project_id, amount_agorot, kind, method,
     reference, note, due_at, created_by)
  values
    (v_org, p_project_id, p_amount_agorot,
     p_kind::core.payment_kind, p_method::core.payment_method,
     pg_catalog.btrim(coalesce(p_reference, '')),
     pg_catalog.btrim(coalesce(p_note, '')), p_due_at, v_uid)
  returning id into v_payment_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'payment.record', 'payment', v_payment_id::text,
          format('تسجيل دفعة على مشروع %s', v_code), v_payload);

  v_result := jsonb_build_object('payment_id', v_payment_id, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'record_payment', v_payment_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.record_check_series(p_project_id uuid, p_checks jsonb, p_idempotency_key uuid, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_code text;
  v_count integer; v_total bigint := 0; v_i integer := 0;
  v_check jsonb; v_amount bigint; v_due timestamptz;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;
  if p_checks is null or pg_catalog.jsonb_typeof(p_checks) <> 'array'
     or pg_catalog.jsonb_array_length(p_checks) = 0 then
    raise exception 'أدخل شيكًا واحدًا على الأقل.' using errcode = 'BD400';
  end if;

  select p.organization_id, p.code into v_org, v_code
  from core.projects p where p.id = p_project_id and p.archived_at is null;
  if v_org is null then
    raise exception 'المشروع غير موجود.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales']::core.app_role[]) then
    raise exception 'دورك لا يسمح بتسجيل الدفعات.' using errcode = 'BD403';
  end if;

  v_count := pg_catalog.jsonb_array_length(p_checks);
  for v_check in select * from pg_catalog.jsonb_array_elements(p_checks) loop
    v_amount := (v_check->>'amount_agorot')::bigint;
    v_due := (v_check->>'due_at')::timestamptz;
    if v_amount is null or v_amount <= 0 then
      raise exception 'كل شيك يجب أن يكون مبلغه أكبر من صفر.' using errcode = 'BD400';
    end if;
    if v_amount % 100 <> 0 then
      raise exception 'المبلغ بالشيكل الصحيح - لا أغورة.' using errcode = 'BD400';
    end if;
    if v_due is null then
      raise exception 'لكل شيك موعد صرفه.' using errcode = 'BD400';
    end if;
    v_total := v_total + v_amount;
  end loop;

  v_payload := jsonb_build_object(
    'op', 'record_check_series', 'user_id', v_uid,
    'project_id', p_project_id, 'checks', p_checks, 'note', coalesce(p_note, ''));

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
    select 1 from core.quotation_versions v
    join core.quotations q on q.id = v.quotation_id
    where q.project_id = p_project_id and v.status = 'approved'
  ) then
    raise exception 'لا يمكن تسجيل دفعة قبل اعتماد الزبون لعرض السعر - لا يوجد مبلغ متفق عليه بعد.'
      using errcode = 'BD409';
  end if;

  perform 1 from core.projects where id = p_project_id for update;

  -- إعادة البحث بعد القفل: المتزامن الثاني ينتظر هنا فيجد عملية الأول
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- الرزمة كلها في معاملة واحدة: المرجع CHK i/N يقرؤها كشف الدفعات رزمةً
  for v_check in select * from pg_catalog.jsonb_array_elements(p_checks) loop
    v_i := v_i + 1;
    insert into core.payments
      (organization_id, project_id, amount_agorot, kind, method,
       reference, note, due_at, created_by)
    values
      (v_org, p_project_id, (v_check->>'amount_agorot')::bigint,
       'milestone', 'check',
       format('CHK %s/%s', v_i, v_count),
       pg_catalog.btrim(coalesce(p_note, '')),
       (v_check->>'due_at')::timestamptz, v_uid);
  end loop;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'payment.checks', 'payment', p_project_id::text,
          format('تسجيل %s شيكات بمجموع %s₪ على %s',
                 v_count, v_total / 100, v_code), v_payload);

  v_result := jsonb_build_object(
    'count', v_count, 'total_agorot', v_total, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'record_check_series', p_project_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.reverse_payment(p_payment_id uuid, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_original core.payments%rowtype;
  v_reason text; v_payment_id uuid;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;
  v_reason := pg_catalog.btrim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'سبب العكس إلزامي.' using errcode = 'BD400';
  end if;

  select * into v_original from core.payments p where p.id = p_payment_id;
  if v_original.id is null then
    raise exception 'الدفعة غير موجودة.' using errcode = 'BD404';
  end if;
  v_org := v_original.organization_id;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales']::core.app_role[]) then
    raise exception 'دورك لا يسمح بتسجيل الدفعات.' using errcode = 'BD403';
  end if;

  v_payload := jsonb_build_object(
    'op', 'reverse_payment', 'user_id', v_uid,
    'payment_id', p_payment_id, 'reason', v_reason);

  -- بحث الإعادة قبل حُرّاس الحالة: عكسٌ نجح وضاع جوابه يعود نتيجةً مخزونة
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- الدفتر جامد فلا UPDATE عليه ولا FOR UPDATE: قفل استشاري على معرّف
  -- الدفعة يصفّف عكسَين متزامنين بلا أن يطلب صلاحيةً لا يملكها المالك
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('baytak:reverse_payment:' || p_payment_id::text, 0));

  -- إعادة البحث بعد القفل: المتزامن الثاني ينتظر هنا فيجد عملية الأول
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  if v_original.kind = 'reversal' then
    raise exception 'قيد العكس لا يُعكس - سجّل دفعة جديدة إن لزم.' using errcode = 'BD409';
  end if;
  if exists (select 1 from core.payments p
             where p.reversed_payment_id = p_payment_id) then
    raise exception 'الدفعة معكوسة بالفعل.' using errcode = 'BD409';
  end if;

  insert into core.payments
    (organization_id, project_id, amount_agorot, kind, method,
     reference, note, reversed_payment_id, created_by)
  values
    (v_org, v_original.project_id, -v_original.amount_agorot,
     'reversal', v_original.method, v_original.reference, v_reason,
     p_payment_id, v_uid)
  returning id into v_payment_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'payment.reverse', 'payment', v_payment_id::text,
          format('عكس دفعة - %s', v_reason), v_payload);

  v_result := jsonb_build_object(
    'payment_id', v_payment_id, 'reversed_payment_id', p_payment_id,
    'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'reverse_payment', v_payment_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.record_staff_payout(p_staff_id uuid, p_amount_agorot bigint, p_idempotency_key uuid, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_name text; v_entry_id uuid;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;
  if p_amount_agorot is null or p_amount_agorot <= 0 then
    raise exception 'المبلغ يجب أن يكون أكبر من صفر.' using errcode = 'BD400';
  end if;
  if p_amount_agorot % 100 <> 0 then
    raise exception 'المبلغ بالشيكل الصحيح - لا أغورة.' using errcode = 'BD400';
  end if;

  -- معرضُ الأدمن لا أول عضوية تصادفها الخطة: قيدٌ مالي لا يحتمل عشوائية
  -- (والترتيب حتمية إضافية لعالمٍ متعدد المعارض مستقبلًا)
  select om.organization_id into v_org
  from core.organization_members om
  where om.user_id = v_uid and om.role = 'admin' and om.is_active
  order by om.organization_id
  limit 1;
  if v_org is null then
    raise exception 'دفعات الطاقم صلاحية الأدمن وحده.' using errcode = 'BD403';
  end if;
  if not exists (select 1 from core.organization_members om
                 where om.organization_id = v_org and om.user_id = p_staff_id
                   and om.is_active) then
    raise exception 'الموظف غير موجود.' using errcode = 'BD404';
  end if;
  select p.full_name into v_name from core.profiles p where p.id = p_staff_id;

  v_payload := jsonb_build_object(
    'op', 'record_staff_payout', 'user_id', v_uid,
    'staff_id', p_staff_id, 'amount_agorot', p_amount_agorot,
    'note', coalesce(p_note, ''));

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('baytak:staff_payout:' || p_staff_id::text, 0));

  -- إعادة البحث بعد القفل: المتزامن الثاني ينتظر هنا فيجد عملية الأول
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  insert into core.staff_ledger
    (organization_id, staff_id, amount_agorot, note, created_by)
  values (v_org, p_staff_id, p_amount_agorot,
          pg_catalog.btrim(coalesce(p_note, '')), v_uid)
  returning id into v_entry_id;

  -- الموظف يعلم بدفعته لحظتها (M8)
  insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
  values (v_org, p_staff_id, 'payment', 'دفعة جديدة',
          format('استلمت %s₪ من إدارة بيتك ديزاين%s.', p_amount_agorot / 100,
                 case when pg_catalog.btrim(coalesce(p_note, '')) <> ''
                      then ' - ' || pg_catalog.btrim(p_note) else '' end),
          null);

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'staff.payout', 'staff_ledger', v_entry_id::text,
          format('دفعة %s₪ إلى %s', p_amount_agorot / 100, coalesce(v_name, '')),
          v_payload);

  v_result := jsonb_build_object('entry_id', v_entry_id, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'record_staff_payout', v_entry_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

notify pgrst, 'reload schema';
