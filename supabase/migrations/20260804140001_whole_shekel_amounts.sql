-- ============================================================================
-- قاعدة المالك الجديدة: لا أغوروت في أي مبلغ — كل قيمة مالية عدد صحيح من
-- الشواكل. الكسر يُسقَط (floor) لا يُقرَّب، فلا يدفع الزبون أبدًا أكثر مما
-- تُظهره الحسبة.
--
-- التطبيق على كل مرحلة لا على الإجمالي وحده، وإلا اختلّ اتساق المستند:
-- بنودٌ فيها أغوروت تُجمع في إجمالي صحيح = أرقام لا تتطابق أمام الزبون.
-- بإسقاط الكسر عند كل بند، مجموع البنود المعروضة = الإجمالي المعروض تمامًا.
--
-- calculation_version يرتفع إلى 2؛ النسخ القديمة تحتفظ بسياقها ولا تُمَس
-- (المحتوى مجمّد بقرار §10 و) فتبقى مقروءة كما صدرت.
-- ============================================================================

create or replace function private.price_project_windows(
  p_org uuid,
  p_project uuid,
  p_ctx jsonb
) returns table (
  window_id          uuid,
  room_name          text,
  window_name        text,
  description        text,
  width_cm           numeric(10,2),
  height_cm          numeric(10,2),
  running_meters     numeric(12,3),
  quantity           integer,
  category           core.pricing_category,
  band               core.height_band,
  unit_price_agorot  bigint,
  line_total_agorot  bigint,
  internal_cost_agorot bigint,
  fabric_meters      numeric(12,3),
  lining_meters      numeric(12,3),
  sort_order         integer
)
language plpgsql
stable
set search_path to ''
as $function$
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
begin
  if p_ctx is null or p_ctx->'settings' is null or p_ctx->'rules' is null then
    raise exception 'سياق تسعير ناقص - المحرك يقرأ من اللقطة الملتقطة حصرًا.'
      using errcode = 'BD400';
  end if;

  v_track          := (p_ctx->'settings'->>'track_cost_per_meter_agorot')::bigint;
  v_delivery       := (p_ctx->'settings'->>'delivery_cost_per_meter_agorot')::bigint;
  v_mi             := (p_ctx->'settings'->>'measure_install_cost_per_meter_agorot')::bigint;
  v_lining_default := (p_ctx->'settings'->>'lining_cost_per_meter_agorot')::bigint;

  for w in
    select win.id, win.name, win.width_cm, win.height_cm, win.quantity,
           win.fullness, win.has_lining, win.notes,
           win.fabric_variant_id,
           r.name as room_name,
           fv.cost_per_meter_agorot as fabric_cost,
           fp.kind as fabric_kind,
           lv.cost_per_meter_agorot as lining_variant_cost
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

    v_band := case when w.height_cm >= 330 then 'tall' else 'standard' end::core.height_band;
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
    v_lm := case when w.has_lining then v_fm else 0 end;

    v_fab_cost := w.fabric_cost;
    v_lin_cost := coalesce(w.lining_variant_cost, v_lining_default);

    v_cost_per_rm :=
        v_fab_cost * w.fullness
      + case when w.has_lining then v_lin_cost * w.fullness else 0 end
      + v_tailor + v_track + v_delivery + v_mi;

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
    unit_price_agorot    := v_price;
    -- ★ إسقاط الأغوروت: شيكل صحيح لكل بند (القاعدة الجديدة)
    line_total_agorot    := (pg_catalog.floor(v_price * v_rm / 100) * 100)::bigint;
    internal_cost_agorot := (pg_catalog.floor(v_cost_per_rm * v_rm / 100) * 100)::bigint;
    fabric_meters        := v_fm;
    lining_meters        := v_lm;
    sort_order           := v_sort;
    return next;
  end loop;
end $function$;


-- ────────────────────────────────────────────────────────────────────────────
-- التجميع: الخصم والضريبة والإيراد الصافي — كلها شواكل صحيحة
-- ────────────────────────────────────────────────────────────────────────────

create or replace function api.create_quotation_version(
  p_project_id uuid,
  p_discount_percent numeric,
  p_note text,
  p_idempotency_key uuid,
  p_expected_project_version integer default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid; v_org uuid; v_status text; v_lock_ver integer;
  v_pct numeric(5,2); v_note text;
  v_payload jsonb; v_prior core.client_operations%rowtype;
  v_context jsonb;
  v_vat numeric;
  v_quotation core.quotations%rowtype;
  v_year integer; v_seq integer; v_number text;
  v_superseded_draft uuid; v_pointer_moved boolean := false;
  v_ver_no integer; v_version_id uuid;
  v_subtotal bigint := 0; v_internal bigint := 0;
  v_discount bigint; v_net bigint; v_vat_amt bigint; v_rev_ex bigint;
  v_margin numeric(6,2);
  v_valid_until timestamptz;
  v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  v_pct := pg_catalog.round(coalesce(p_discount_percent, 0), 2);
  if v_pct < 0 or v_pct > 100 then
    raise exception 'نسبة الخصم يجب أن تكون بين 0 و100.' using errcode = 'BD400';
  end if;
  v_note := pg_catalog.btrim(coalesce(p_note, ''));

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
    raise exception 'دورك لا يسمح بإنشاء عروض الأسعار.' using errcode = 'BD403';
  end if;

  v_payload := jsonb_build_object(
    'op', 'create_quotation_version', 'user_id', v_uid,
    'project_id', p_project_id, 'discount_percent', v_pct, 'note', v_note);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة. استخدم مفتاحًا جديدًا.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  if v_status not in ('measured', 'quotation') then
    raise exception 'لا يمكن إنشاء عرض والمشروع في حالة "%". يلزم أن يكون مقاسًا أو في مرحلة العرض.',
      v_status using errcode = 'BD409';
  end if;
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  select jsonb_build_object(
    'calculation_version', 2,
    'captured_at',         now(),
    'vat_mode',            'inclusive',
    'vat_percent',         bs.vat_percent,
    'rounding_policy',     'floor_to_whole_shekel_per_stage',
    'currency',            pg_catalog.btrim(bs.currency),
    'validity_days',       bs.quotation_validity_days,
    'min_margin_percent',  bs.min_margin_percent,
    'employee_discount_limit_percent', bs.employee_discount_limit_percent,
    'admin_discount_limit_percent',    bs.admin_discount_limit_percent,
    'components_enabled',  jsonb_build_object(
        'track', true, 'delivery', true, 'measure_install', true),
    'settings', jsonb_build_object(
        'track_cost_per_meter_agorot',           bs.track_cost_per_meter_agorot,
        'delivery_cost_per_meter_agorot',        bs.delivery_cost_per_meter_agorot,
        'measure_install_cost_per_meter_agorot', bs.measure_install_cost_per_meter_agorot,
        'lining_cost_per_meter_agorot',          bs.lining_cost_per_meter_agorot,
        'timezone',                              bs.timezone),
    'rules', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'band', pr.band, 'category', pr.category,
                 'customer_price_per_meter_agorot', pr.customer_price_per_meter_agorot,
                 'tailor_cost_per_meter_agorot',    pr.tailor_cost_per_meter_agorot)
               order by pr.band, pr.category)
        from core.pricing_rules pr where pr.organization_id = v_org), '[]'::jsonb))
  into v_context
  from core.business_settings bs
  where bs.organization_id = v_org;

  if v_context is null then
    raise exception 'إعدادات المؤسسة غير موجودة.' using errcode = 'BD404';
  end if;
  v_vat := (v_context->>'vat_percent')::numeric;

  select * into v_quotation from core.quotations q
  where q.organization_id = v_org and q.project_id = p_project_id;

  if not found then
    v_year := extract(year from (now() at time zone (v_context->'settings'->>'timezone')))::integer;

    insert into core.document_sequences (organization_id, doc_type, year, last_number)
    values (v_org, 'quotation', v_year, 0)
    on conflict (organization_id, doc_type, year) do nothing;

    select ds.last_number into v_seq
    from core.document_sequences ds
    where ds.organization_id = v_org and ds.doc_type = 'quotation' and ds.year = v_year
    for update;

    select * into v_quotation from core.quotations q
    where q.organization_id = v_org and q.project_id = p_project_id;

    if not found then
      update core.document_sequences
         set last_number = v_seq + 1
       where organization_id = v_org and doc_type = 'quotation' and year = v_year;

      v_number := 'Q-' || v_year || '-' || lpad((v_seq + 1)::text, 4, '0');

      insert into core.quotations (organization_id, project_id, number)
      values (v_org, p_project_id, v_number)
      returning * into v_quotation;
    else
      perform 1 from core.quotations where id = v_quotation.id for update;
      v_number := v_quotation.number;
    end if;
  else
    perform 1 from core.quotations where id = v_quotation.id for update;
    v_number := v_quotation.number;
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

  if exists (select 1 from core.quotation_versions
             where quotation_id = v_quotation.id and status = 'approved') then
    raise exception 'العرض % معتمد من الزبون - لا نسخ جديدة بعد الاعتماد.',
      v_number using errcode = 'BD409';
  end if;

  update core.quotation_versions
     set status = 'superseded', superseded_at = now(), locked = true
   where quotation_id = v_quotation.id and status = 'draft'
  returning id into v_superseded_draft;

  v_valid_until := now() + make_interval(days => (v_context->>'validity_days')::integer);

  select coalesce(max(version_number), 0) + 1 into v_ver_no
  from core.quotation_versions where quotation_id = v_quotation.id;

  insert into core.quotation_versions
    (organization_id, quotation_id, version_number, discount_percent,
     valid_until, note, created_by, pricing_context)
  values
    (v_org, v_quotation.id, v_ver_no, v_pct, v_valid_until, v_note, v_uid, v_context)
  returning id into v_version_id;

  insert into core.quotation_items
    (organization_id, version_id, window_id, room_name, window_name, description,
     width_cm, height_cm, running_meters, quantity, category, band,
     unit_price_agorot, line_total_agorot, internal_cost_agorot,
     fabric_meters, lining_meters, sort_order)
  select v_org, v_version_id, e.window_id, e.room_name, e.window_name, e.description,
         e.width_cm, e.height_cm, e.running_meters, e.quantity, e.category, e.band,
         e.unit_price_agorot, e.line_total_agorot, e.internal_cost_agorot,
         e.fabric_meters, e.lining_meters, e.sort_order
  from private.price_project_windows(v_org, p_project_id, v_context) e;

  select coalesce(sum(line_total_agorot), 0), coalesce(sum(internal_cost_agorot), 0)
    into v_subtotal, v_internal
  from core.quotation_items where version_id = v_version_id;

  if v_subtotal = 0 then
    raise exception 'لا شبابيك مقاسة للمشروع - لا يمكن إنشاء عرض فارغ.'
      using errcode = 'BD422';
  end if;

  -- ★ كل مرحلة بشيكل صحيح: البنود صحيحة بالبناء، والخصم يُسقط كسره،
  -- والصافي يبقى صحيحًا، والضريبة تُشتق منه فتبقى صحيحة أيضًا.
  v_discount := (pg_catalog.floor(v_subtotal * v_pct / 100 / 100) * 100)::bigint;
  v_net      := v_subtotal - v_discount;
  v_rev_ex   := (pg_catalog.floor(v_net / (1 + v_vat / 100) / 100) * 100)::bigint;
  v_vat_amt  := v_net - v_rev_ex;
  v_margin   := case when v_rev_ex > 0
                     then pg_catalog.round((v_rev_ex - v_internal)::numeric / v_rev_ex * 100, 2)
                     else 0 end;

  update core.quotation_versions
     set subtotal_agorot = v_subtotal, discount_agorot = v_discount,
         vat_agorot = v_vat_amt, total_agorot = v_net,
         internal_cost_agorot = v_internal, margin_percent = v_margin
   where id = v_version_id;

  if v_quotation.current_version_id is null
     or v_quotation.current_version_id = v_superseded_draft then
    update core.quotations
       set current_version_id = v_version_id, updated_at = now()
     where id = v_quotation.id;
    v_pointer_moved := true;
  else
    update core.quotations set updated_at = now() where id = v_quotation.id;
  end if;

  select p.status_code, p.lock_version into v_status, v_lock_ver
  from core.projects p where p.id = p_project_id for update;

  if v_status not in ('measured', 'quotation') then
    raise exception 'لا يمكن إنشاء عرض والمشروع في حالة "%".', v_status
      using errcode = 'BD409';
  end if;
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'quotation.create_version', 'quotation_version',
          v_version_id::text,
          format('إنشاء النسخة %s من العرض %s', v_ver_no, v_number), v_payload);

  v_result := jsonb_build_object(
    'quotation_id',        v_quotation.id,
    'quotation_number',    v_number,
    'version_id',          v_version_id,
    'version_number',      v_ver_no,
    'subtotal_agorot',     v_subtotal,
    'discount_agorot',     v_discount,
    'vat_agorot',          v_vat_amt,
    'total_agorot',        v_net,
    'margin_percent',      v_margin,
    'valid_until',         v_valid_until,
    'superseded_draft_id', v_superseded_draft,
    'pointer_moved',       v_pointer_moved,
    'was_replayed',        false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'create_quotation_version', v_version_id::text, 'synced',
          v_payload, v_result, now());

  return v_result;
end $function$;
