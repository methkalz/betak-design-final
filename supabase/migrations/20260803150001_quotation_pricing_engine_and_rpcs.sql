-- ============================================================================
-- محرك التسعير ودوال دورة حياة العروض — تنفيذ §10 المصادَق عليها شرطيًا
-- (بعد إغلاق اعتراضات جولة التصديق الخمسة في الالتزام السابق).
--
-- المحتوى:
--   1) عمود pricing_context على النسخ + توسيع حارس التجميد ليشمله
--   2) private.price_project_windows — محرك التسعير (الفصل الثلاثي)
--   3) private.quotation_content_canonical + version_content_fingerprint (ح-1)
--   4) api.create_quotation_version   (المؤشر لا يتحرك وعرضٌ مرسل قائم)
--   5) api.send_quotation_version     (يقبل مسودة، يستبدل المرسلة، بوابتا
--                                      الخصم والهامش على السياق المجمّد)
--   6) api.approve_quotation_version  (الحالية + sent + غير منقضية؛ يحرّك
--                                      المشروع إلى customer_approved ذريًا)
--   7) api.reject_quotation_version   (الحالية + sent؛ ملاحظة إلزامية؛
--                                      جائز على المنقضية فعليًا)
--
-- ترتيب الأقفال الملزم (§10 ز):
--   document_sequences → quotation → version(s) → project (أخيرًا دائمًا)
-- بصمات v3 لكل دالة بالحمولات القانونية المسرودة في §10 ح-2؛
-- expected_project_version خارج البصمة دائمًا.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- (1) سياق التسعير المجمّد + توسيع حارس التجميد
-- ────────────────────────────────────────────────────────────────────────────

alter table core.quotation_versions
  add column pricing_context jsonb not null default '{}'::jsonb;

comment on column core.quotation_versions.pricing_context is
  'لقطة قواعد التسعير والإعدادات لحظة الإنشاء (calculation_version, vat_mode, '
  'vat_percent, rounding_policy, currency, rules[], settings{}, '
  'components_enabled). يملؤها RPC الإنشاء حصرًا وتتجمد مع locked — تغيّر '
  'الأسعار أو الضريبة بعد الإرسال أثره صفر على النسخة (§10 و).';

-- الحارس القائم منذ 0014 يجمّد المبالغ وvalid_until؛ يُضاف pricing_context
create or replace function private.guard_locked_version()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if old.locked then
    if new.subtotal_agorot   is distinct from old.subtotal_agorot
    or new.discount_percent  is distinct from old.discount_percent
    or new.discount_agorot   is distinct from old.discount_agorot
    or new.vat_agorot        is distinct from old.vat_agorot
    or new.total_agorot      is distinct from old.total_agorot
    or new.internal_cost_agorot is distinct from old.internal_cost_agorot
    or new.valid_until       is distinct from old.valid_until
    or new.pricing_context   is distinct from old.pricing_context then
      raise exception 'النسخة % مقفلة: أنشئ نسخة جديدة بدل تعديلها.',
        old.version_number using errcode = '42501';
    end if;
  end if;
  return new;
end $function$;


-- ────────────────────────────────────────────────────────────────────────────
-- (2) محرك التسعير — الفصل الثلاثي القسري (§10 هـ)
-- billable_rm أساس الفوترة الوحيد؛ المعامل على الاستهلاك والتكلفة حصرًا؛
-- سعر الزبون لا يلمس المعامل أبدًا. فوق 500 سم BD422 بلا تسعير تلقائي.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function private.price_project_windows(
  p_org uuid,
  p_project uuid
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
  s core.business_settings%rowtype;
  v_band core.height_band;
  v_cat core.pricing_category;
  v_rule core.pricing_rules%rowtype;
  v_rm numeric(12,3);
  v_fm numeric(12,3);
  v_lm numeric(12,3);
  v_fab_cost bigint;
  v_lin_cost bigint;
  v_cost_per_rm numeric;  -- دقة كاملة عمدًا — التقريب مرة واحدة على البند
  v_sort integer := 0;
begin
  select * into s from core.business_settings where organization_id = p_org;
  if not found then
    raise exception 'إعدادات المؤسسة غير موجودة.' using errcode = 'BD404';
  end if;

  for w in
    select win.id, win.name, win.width_cm, win.height_cm, win.quantity,
           win.fullness, win.has_lining, win.notes,
           win.fabric_variant_id, win.lining_variant_id,
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

    -- فوق 500 سم: لا تسعير تلقائي (§10 هـ — تصحيح انحراف النموذج الأولي)
    if w.height_cm > 500 then
      raise exception 'الشباك "%" ارتفاعه % سم — فوق 500 سم يلزم تسعيرة خاصة من الأدمن، لا تسعير تلقائي.',
        w.name, w.height_cm using errcode = 'BD422';
    end if;
    if w.fabric_variant_id is null or w.fabric_cost is null then
      raise exception 'الشباك "%" بلا قماش محدد — اختر القماش قبل إنشاء العرض.',
        w.name using errcode = 'BD422';
    end if;

    v_band := case when w.height_cm >= 330 then 'tall' else 'standard' end::core.height_band;
    v_cat  := case
                when w.fabric_kind = 'crepe' and w.has_lining     then 'crepe_with_lining'
                when w.fabric_kind = 'crepe' and not w.has_lining then 'crepe_without_lining'
                when w.has_lining                                 then 'other_with_lining'
                else 'other_without_lining'
              end::core.pricing_category;

    select * into v_rule from core.pricing_rules pr
    where pr.organization_id = p_org and pr.band = v_band and pr.category = v_cat;
    if not found then
      raise exception 'لا قاعدة تسعير للفئة % والارتفاع % — راجع إعدادات التسعير.',
        v_cat, v_band using errcode = 'BD422';
    end if;

    -- الفصل الثلاثي (§10 هـ): أساس الفوترة ← معامل الاستهلاك ← التكلفة
    v_rm := pg_catalog.round(w.width_cm / 100 * w.quantity, 3);
    v_fm := pg_catalog.round(v_rm * w.fullness, 3);
    v_lm := case when w.has_lining then v_fm else 0 end;

    v_fab_cost := w.fabric_cost;
    v_lin_cost := coalesce(w.lining_variant_cost, s.lining_cost_per_meter_agorot);

    v_cost_per_rm :=
        v_fab_cost * w.fullness
      + case when w.has_lining then v_lin_cost * w.fullness else 0 end
      + v_rule.tailor_cost_per_meter_agorot
      + s.track_cost_per_meter_agorot
      + s.delivery_cost_per_meter_agorot
      + s.measure_install_cost_per_meter_agorot;

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
    unit_price_agorot    := v_rule.customer_price_per_meter_agorot;
    line_total_agorot    := pg_catalog.round(v_rule.customer_price_per_meter_agorot * v_rm)::bigint;
    internal_cost_agorot := pg_catalog.round(v_cost_per_rm * v_rm)::bigint;
    fabric_meters        := v_fm;
    lining_meters        := v_lm;
    sort_order           := v_sort;
    return next;
  end loop;
end $function$;

revoke all on function private.price_project_windows(uuid, uuid) from public;
grant execute on function private.price_project_windows(uuid, uuid) to baytak_rpc_owner;


-- ────────────────────────────────────────────────────────────────────────────
-- (3) بصمة المحتوى القانونية fp1 (§10 ح-1) — دالة واحدة للالتقاط والتحقق
-- نص قانوني محدد البايتات: حقول بـ'|' وبنود بـ'||' مرتبة (sort_order, id).
-- التمثيل الرقمي تثبته أنواع الأعمدة عبر ::text — لا تنسيق حر.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function private.quotation_content_canonical(p_version_id uuid)
returns text
language sql
stable
set search_path to ''
as $function$
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

create or replace function private.version_content_fingerprint(p_version_id uuid)
returns text
language sql
stable
set search_path to ''
as $function$
  select encode(extensions.digest(
           private.quotation_content_canonical(p_version_id), 'sha256'), 'hex')
$function$;

revoke all on function private.quotation_content_canonical(uuid) from public;
revoke all on function private.version_content_fingerprint(uuid) from public;
grant execute on function private.quotation_content_canonical(uuid) to baytak_rpc_owner;
grant execute on function private.version_content_fingerprint(uuid) to baytak_rpc_owner;


-- ────────────────────────────────────────────────────────────────────────────
-- (4) api.create_quotation_version
-- ينشئ مسودة محسوبة خادميًا بالكامل — الجهاز لا يرسل أرقامًا.
-- المؤشر لا يتحرك إلا إذا كان NULL أو على المسودة المستبدلة (اعتراض 1).
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
  s core.business_settings%rowtype;
  v_quotation core.quotations%rowtype;
  v_year integer; v_seq integer; v_number text;
  v_superseded_draft uuid; v_pointer_moved boolean := false;
  v_ver_no integer; v_version_id uuid;
  v_subtotal bigint := 0; v_internal bigint := 0;
  v_discount bigint; v_net bigint; v_vat bigint; v_rev_ex bigint;
  v_margin numeric(6,2);
  v_context jsonb; v_valid_until timestamptz;
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

  -- بصمة v3 (§10 ح-2): create|project|discount|note — بلا expected_version
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

  -- إخفاق سريع غير حاسم — الفحص الملزم يتكرر تحت قفل المشروع أدناه
  if v_status not in ('measured', 'quotation') then
    raise exception 'لا يمكن إنشاء عرض والمشروع في حالة "%". يلزم أن يكون مقاسًا أو في مرحلة العرض.',
      v_status using errcode = 'BD409';
  end if;
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  select * into s from core.business_settings where organization_id = v_org;
  if not found then
    raise exception 'إعدادات المؤسسة غير موجودة.' using errcode = 'BD404';
  end if;

  -- ── الأقفال بالترتيب الملزم: document_sequences ← quotation ── ──────────
  select * into v_quotation from core.quotations q
  where q.organization_id = v_org and q.project_id = p_project_id;

  if not found then
    -- العرض الأول للمشروع: قفل العداد أولًا (لا صف عرض يُقفل بعد)
    v_year := extract(year from (now() at time zone s.timezone))::integer;

    insert into core.document_sequences (organization_id, doc_type, year, last_number)
    values (v_org, 'quotation', v_year, 0)
    on conflict (organization_id, doc_type, year) do nothing;

    select ds.last_number into v_seq
    from core.document_sequences ds
    where ds.organization_id = v_org and ds.doc_type = 'quotation' and ds.year = v_year
    for update;

    -- إعادة الفحص تحت قفل العداد: سباق «عرضين أولين» لنفس المشروع —
    -- الخاسر يجد العرض الذي أنشأه الفائز ولا يستهلك رقمًا جديدًا
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

  -- إعادة فحص idempotency بعد أول قفل (نمط البيت)
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- عرض اعتُمدت نسخة منه لا يقبل نسخًا جديدة (§10 د)
  if exists (select 1 from core.quotation_versions
             where quotation_id = v_quotation.id and status = 'approved') then
    raise exception 'العرض % معتمد من الزبون — لا نسخ جديدة بعد الاعتماد.',
      v_number using errcode = 'BD409';
  end if;

  -- استبدال المسودة القائمة (مسودة واحدة قابلة للعمل)
  update core.quotation_versions
     set status = 'superseded', superseded_at = now(), locked = true
   where quotation_id = v_quotation.id and status = 'draft'
  returning id into v_superseded_draft;

  -- سياق التسعير المجمّد (§10 هـ)
  v_context := jsonb_build_object(
    'calculation_version', 1,
    'captured_at',         now(),
    'vat_mode',            'inclusive',
    'vat_percent',         s.vat_percent,
    'rounding_policy',     'half_away_from_zero_per_stage',
    'currency',            pg_catalog.btrim(s.currency),
    'validity_days',       s.quotation_validity_days,
    'min_margin_percent',  s.min_margin_percent,
    'employee_discount_limit_percent', s.employee_discount_limit_percent,
    'admin_discount_limit_percent',    s.admin_discount_limit_percent,
    'components_enabled',  jsonb_build_object(
        'track', true, 'delivery', true, 'measure_install', true),
    'settings', jsonb_build_object(
        'track_cost_per_meter_agorot',           s.track_cost_per_meter_agorot,
        'delivery_cost_per_meter_agorot',        s.delivery_cost_per_meter_agorot,
        'measure_install_cost_per_meter_agorot', s.measure_install_cost_per_meter_agorot,
        'lining_cost_per_meter_agorot',          s.lining_cost_per_meter_agorot),
    'rules', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'band', pr.band, 'category', pr.category,
                 'customer_price_per_meter_agorot', pr.customer_price_per_meter_agorot,
                 'tailor_cost_per_meter_agorot',    pr.tailor_cost_per_meter_agorot)
               order by pr.band, pr.category)
        from core.pricing_rules pr where pr.organization_id = v_org), '[]'::jsonb));

  v_valid_until := now() + make_interval(days => s.quotation_validity_days);

  -- ترقيم النسخة تحت قفل صف العرض
  select coalesce(max(version_number), 0) + 1 into v_ver_no
  from core.quotation_versions where quotation_id = v_quotation.id;

  insert into core.quotation_versions
    (organization_id, quotation_id, version_number, discount_percent,
     valid_until, note, created_by, pricing_context)
  values
    (v_org, v_quotation.id, v_ver_no, v_pct, v_valid_until, v_note, v_uid, v_context)
  returning id into v_version_id;

  -- البنود من المحرك — الحساب كله في القاعدة
  insert into core.quotation_items
    (organization_id, version_id, window_id, room_name, window_name, description,
     width_cm, height_cm, running_meters, quantity, category, band,
     unit_price_agorot, line_total_agorot, internal_cost_agorot,
     fabric_meters, lining_meters, sort_order)
  select v_org, v_version_id, e.window_id, e.room_name, e.window_name, e.description,
         e.width_cm, e.height_cm, e.running_meters, e.quantity, e.category, e.band,
         e.unit_price_agorot, e.line_total_agorot, e.internal_cost_agorot,
         e.fabric_meters, e.lining_meters, e.sort_order
  from private.price_project_windows(v_org, p_project_id) e;

  select coalesce(sum(line_total_agorot), 0), coalesce(sum(internal_cost_agorot), 0)
    into v_subtotal, v_internal
  from core.quotation_items where version_id = v_version_id;

  if v_subtotal = 0 then
    raise exception 'لا شبابيك مقاسة للمشروع — لا يمكن إنشاء عرض فارغ.'
      using errcode = 'BD422';
  end if;

  -- التجميع بسياسة «شاملة الضريبة» (§10 هـ — قرار مالك 2026-08-03)
  v_discount := pg_catalog.round(v_subtotal * v_pct / 100)::bigint;
  v_net      := v_subtotal - v_discount;
  v_vat      := v_net - pg_catalog.round(v_net / (1 + s.vat_percent / 100))::bigint;
  v_rev_ex   := v_net - v_vat;
  v_margin   := case when v_rev_ex > 0
                     then pg_catalog.round((v_rev_ex - v_internal)::numeric / v_rev_ex * 100, 2)
                     else 0 end;

  update core.quotation_versions
     set subtotal_agorot = v_subtotal, discount_agorot = v_discount,
         vat_agorot = v_vat, total_agorot = v_net,
         internal_cost_agorot = v_internal, margin_percent = v_margin
   where id = v_version_id;

  -- المؤشر (اعتراض 1): يتحرك فقط إذا كان NULL أو على المسودة المستبدلة
  if v_quotation.current_version_id is null
     or v_quotation.current_version_id = v_superseded_draft then
    update core.quotations
       set current_version_id = v_version_id, updated_at = now()
     where id = v_quotation.id;
    v_pointer_moved := true;
  else
    update core.quotations set updated_at = now() where id = v_quotation.id;
  end if;

  -- ★ المشروع آخر الأقفال دائمًا — الفحوص الحاسمة تحته
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
    'vat_agorot',          v_vat,
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


-- ────────────────────────────────────────────────────────────────────────────
-- (5) api.send_quotation_version — يقبل مسودة (لا يشترط كونها الحالية)،
-- يستبدل المرسلة السابقة ويحدّث المؤشر ذريًا. بوابتا الخصم والهامش على
-- السياق المجمّد (تغيّر الإعدادات بعد الإنشاء أثره صفر — §10 و).
-- ────────────────────────────────────────────────────────────────────────────

create or replace function api.send_quotation_version(
  p_version_id uuid,
  p_idempotency_key uuid,
  p_expected_project_version integer default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid; v_org uuid; v_status text; v_lock_ver integer;
  v_ver core.quotation_versions%rowtype;
  v_project uuid;
  v_payload jsonb; v_prior core.client_operations%rowtype;
  v_ctx jsonb;
  v_emp_limit numeric; v_admin_limit numeric; v_min_margin numeric;
  v_is_admin boolean;
  v_dr core.discount_requests%rowtype;
  v_fp text;
  v_superseded_sent uuid;
  v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  select * into v_ver from core.quotation_versions where id = p_version_id;
  if not found then
    raise exception 'نسخة العرض غير موجودة.' using errcode = 'BD404';
  end if;
  v_org := v_ver.organization_id;
  select q.project_id into v_project from core.quotations q where q.id = v_ver.quotation_id;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في مؤسسة هذا العرض.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales']::core.app_role[]) then
    raise exception 'دورك لا يسمح بإرسال عروض الأسعار.' using errcode = 'BD403';
  end if;

  -- بصمة v3 (§10 ح-2): send|version — بلا expected_version
  v_payload := jsonb_build_object(
    'op', 'send_quotation_version', 'user_id', v_uid, 'version_id', p_version_id);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة. استخدم مفتاحًا جديدًا.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  if v_ver.status <> 'draft' then
    raise exception 'الإرسال للمسودات فقط — حالة النسخة الحالية "%".', v_ver.status
      using errcode = 'BD409';
  end if;

  -- ── الأقفال: quotation ← version(s) ── (لا عداد هنا) ────────────────────
  perform 1 from core.quotations where id = v_ver.quotation_id for update;

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
  select * into v_ver from core.quotation_versions where id = p_version_id for update;
  if v_ver.status <> 'draft' then
    raise exception 'الإرسال للمسودات فقط — حالة النسخة "%".', v_ver.status
      using errcode = 'BD409';
  end if;

  v_ctx := v_ver.pricing_context;
  v_emp_limit   := (v_ctx->>'employee_discount_limit_percent')::numeric;
  v_admin_limit := (v_ctx->>'admin_discount_limit_percent')::numeric;
  v_min_margin  := (v_ctx->>'min_margin_percent')::numeric;
  v_is_admin    := private.is_admin(v_org);

  -- بوابة الهامش الأدنى — سقف مطلق لا يكسره أي مسار خصم (§10 هـ)
  if v_ver.margin_percent < v_min_margin then
    raise exception 'الهامش % أقل من الحد الأدنى % — لا إرسال تحت الحد مهما كان الخصم.',
      v_ver.margin_percent, v_min_margin using errcode = 'BD422';
  end if;

  -- بوابة الخصم (§10 ب): المصفوفة الرباعية على حدود السياق المجمّد
  if v_ver.discount_percent > v_emp_limit then
    if v_ver.discount_percent <= v_admin_limit and v_is_admin then
      null;  -- الأدمن ضمن حده يمرّ مباشرة
    else
      -- sales فوق حد الموظف، أو أي أحد فوق حد الأدمن (Override موثق)
      select * into v_dr from core.discount_requests dr
      where dr.version_id = p_version_id
        and dr.status = 'approved'
        and dr.requested_percent = v_ver.discount_percent
      order by dr.decided_at desc limit 1;

      if not found then
        raise exception 'خصم % يتجاوز صلاحيتك — يلزم طلب خصم معتمد من الأدمن بنفس النسبة.',
          v_ver.discount_percent using errcode = 'BD403';
      end if;

      -- صلاحية الموافقة مربوطة بالمحتوى (§10 ب + ح-1)
      v_fp := private.version_content_fingerprint(p_version_id);
      if v_dr.content_fingerprint <> v_fp then
        raise exception 'تغيّر محتوى النسخة بعد موافقة الخصم — أعد طلب الموافقة على المحتوى الحالي.'
          using errcode = 'BD409';
      end if;
    end if;
  end if;

  -- استبدال المرسلة السابقة (أختام الإرسال الحقيقية تبقى — الشكل يسمح)
  update core.quotation_versions
     set status = 'superseded', superseded_at = now()
   where quotation_id = v_ver.quotation_id and status = 'sent'
  returning id into v_superseded_sent;

  update core.quotation_versions
     set status = 'sent', sent_at = now(), sent_by = v_uid, locked = true
   where id = p_version_id;

  -- المؤشر والأب — ذريًا في نفس المعاملة (اعتراض 1)
  update core.quotations
     set current_version_id = p_version_id, status = 'sent', updated_at = now()
   where id = v_ver.quotation_id;

  -- ★ المشروع آخر الأقفال دائمًا
  select p.status_code, p.lock_version into v_status, v_lock_ver
  from core.projects p where p.id = v_project for update;

  if v_status not in ('measured', 'quotation') then
    raise exception 'لا يمكن الإرسال والمشروع في حالة "%".', v_status
      using errcode = 'BD409';
  end if;
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  v_fp := coalesce(v_fp, private.version_content_fingerprint(p_version_id));

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'quotation.send_version', 'quotation_version',
          p_version_id::text,
          format('إرسال النسخة %s للزبون', v_ver.version_number),
          v_payload || jsonb_build_object('content_fingerprint', v_fp));

  v_result := jsonb_build_object(
    'version_id',          p_version_id,
    'quotation_id',        v_ver.quotation_id,
    'version_number',      v_ver.version_number,
    'superseded_sent_id',  v_superseded_sent,
    'content_fingerprint', v_fp,
    'was_replayed',        false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'send_quotation_version', p_version_id::text, 'synced',
          v_payload, v_result, now());

  return v_result;
end $function$;


-- ────────────────────────────────────────────────────────────────────────────
-- (6) api.approve_quotation_version — الحالية + sent + غير منقضية؛
-- يحرّك المشروع quotation/measured ← customer_approved ذريًا.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function api.approve_quotation_version(
  p_version_id uuid,
  p_idempotency_key uuid,
  p_decision_note text default '',
  p_expected_project_version integer default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid; v_org uuid; v_status text; v_lock_ver integer;
  v_ver core.quotation_versions%rowtype;
  v_project uuid; v_current uuid; v_note text;
  v_payload jsonb; v_prior core.client_operations%rowtype;
  v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;
  v_note := pg_catalog.btrim(coalesce(p_decision_note, ''));

  select * into v_ver from core.quotation_versions where id = p_version_id;
  if not found then
    raise exception 'نسخة العرض غير موجودة.' using errcode = 'BD404';
  end if;
  v_org := v_ver.organization_id;
  select q.project_id, q.current_version_id into v_project, v_current
  from core.quotations q where q.id = v_ver.quotation_id;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في مؤسسة هذا العرض.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales']::core.app_role[]) then
    raise exception 'دورك لا يسمح بتسجيل قرار الزبون.' using errcode = 'BD403';
  end if;

  -- بصمة v3 (§10 ح-2): approve|version|note — بلا expected_version
  v_payload := jsonb_build_object(
    'op', 'approve_quotation_version', 'user_id', v_uid,
    'version_id', p_version_id, 'decision_note', v_note);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة. استخدم مفتاحًا جديدًا.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- إخفاق سريع — الفحوص الحاسمة تحت الأقفال أدناه
  if v_current is distinct from p_version_id then
    raise exception 'الاعتماد للنسخة الحالية فقط.' using errcode = 'BD409';
  end if;
  if v_ver.status <> 'sent' then
    raise exception 'الاعتماد لنسخة مرسلة فقط — الحالة "%".', v_ver.status
      using errcode = 'BD409';
  end if;

  -- ── الأقفال: quotation ← version ── ─────────────────────────────────────
  perform 1 from core.quotations where id = v_ver.quotation_id for update;

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  select q.current_version_id into v_current
  from core.quotations q where q.id = v_ver.quotation_id;
  select * into v_ver from core.quotation_versions where id = p_version_id for update;

  if v_current is distinct from p_version_id then
    raise exception 'الاعتماد للنسخة الحالية فقط.' using errcode = 'BD409';
  end if;
  if v_ver.status <> 'sent' then
    raise exception 'الاعتماد لنسخة مرسلة فقط — الحالة "%".', v_ver.status
      using errcode = 'BD409';
  end if;
  -- الانقضاء مصدر حقيقة واحد: يُفحص تحت القفل ولا يُثبَّت عرضيًا (§10 أ)
  if v_ver.valid_until < now() then
    raise exception 'انتهت صلاحية النسخة في % — أنشئ نسخة جديدة بأسعار وصلاحية جديدتين.',
      v_ver.valid_until using errcode = 'BD409';
  end if;

  update core.quotation_versions
     set status = 'approved', approved_at = now(),
         decision_recorded_by = v_uid, decision_note = v_note
   where id = p_version_id;

  update core.quotations
     set status = 'approved', updated_at = now()
   where id = v_ver.quotation_id;

  -- ★ المشروع آخر الأقفال — الاعتماد يحرّكه إلى customer_approved ذريًا
  select p.status_code, p.lock_version into v_status, v_lock_ver
  from core.projects p where p.id = v_project for update;

  if v_status not in ('measured', 'quotation') then
    raise exception 'لا يمكن الاعتماد والمشروع في حالة "%".', v_status
      using errcode = 'BD409';
  end if;
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  perform set_config('app.rpc_context', 'on', true);
  update core.projects set status_code = 'customer_approved' where id = v_project;
  perform set_config('app.rpc_context', '', true);

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'quotation.approve_version', 'quotation_version',
          p_version_id::text,
          format('اعتماد الزبون للنسخة %s', v_ver.version_number), v_payload);

  v_result := jsonb_build_object(
    'version_id',     p_version_id,
    'quotation_id',   v_ver.quotation_id,
    'version_number', v_ver.version_number,
    'project_id',     v_project,
    'project_status', 'customer_approved',
    'was_replayed',   false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'approve_quotation_version', p_version_id::text, 'synced',
          v_payload, v_result, now());

  return v_result;
end $function$;


-- ────────────────────────────────────────────────────────────────────────────
-- (7) api.reject_quotation_version — الحالية + sent؛ الملاحظة إلزامية؛
-- جائز على المنقضية فعليًا (تسجيل واقعة تجارية). المشروع لا يتغير.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function api.reject_quotation_version(
  p_version_id uuid,
  p_idempotency_key uuid,
  p_decision_note text default '',
  p_expected_project_version integer default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid; v_org uuid; v_status text; v_lock_ver integer;
  v_ver core.quotation_versions%rowtype;
  v_project uuid; v_current uuid; v_note text;
  v_payload jsonb; v_prior core.client_operations%rowtype;
  v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  v_note := pg_catalog.btrim(coalesce(p_decision_note, ''));
  if v_note = '' then
    raise exception 'ملاحظة قرار الرفض إلزامية — سجّل سبب رفض الزبون.'
      using errcode = 'BD422';
  end if;

  select * into v_ver from core.quotation_versions where id = p_version_id;
  if not found then
    raise exception 'نسخة العرض غير موجودة.' using errcode = 'BD404';
  end if;
  v_org := v_ver.organization_id;
  select q.project_id, q.current_version_id into v_project, v_current
  from core.quotations q where q.id = v_ver.quotation_id;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في مؤسسة هذا العرض.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales']::core.app_role[]) then
    raise exception 'دورك لا يسمح بتسجيل قرار الزبون.' using errcode = 'BD403';
  end if;

  -- بصمة v3 (§10 ح-2): reject|version|note — بلا expected_version
  v_payload := jsonb_build_object(
    'op', 'reject_quotation_version', 'user_id', v_uid,
    'version_id', p_version_id, 'decision_note', v_note);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة. استخدم مفتاحًا جديدًا.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  if v_current is distinct from p_version_id then
    raise exception 'الرفض للنسخة الحالية فقط.' using errcode = 'BD409';
  end if;
  if v_ver.status <> 'sent' then
    raise exception 'الرفض لنسخة مرسلة فقط — الحالة "%".', v_ver.status
      using errcode = 'BD409';
  end if;

  -- ── الأقفال: quotation ← version ── ─────────────────────────────────────
  perform 1 from core.quotations where id = v_ver.quotation_id for update;

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  select q.current_version_id into v_current
  from core.quotations q where q.id = v_ver.quotation_id;
  select * into v_ver from core.quotation_versions where id = p_version_id for update;

  if v_current is distinct from p_version_id then
    raise exception 'الرفض للنسخة الحالية فقط.' using errcode = 'BD409';
  end if;
  if v_ver.status <> 'sent' then
    raise exception 'الرفض لنسخة مرسلة فقط — الحالة "%".', v_ver.status
      using errcode = 'BD409';
  end if;

  update core.quotation_versions
     set status = 'rejected', rejected_at = now(),
         decision_recorded_by = v_uid, decision_note = v_note
   where id = p_version_id;

  update core.quotations
     set status = 'rejected', updated_at = now()
   where id = v_ver.quotation_id;

  -- ★ المشروع آخر الأقفال — بلا تغيير حالة (إعادة العرض تبقى ممكنة)
  select p.status_code, p.lock_version into v_status, v_lock_ver
  from core.projects p where p.id = v_project for update;

  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'quotation.reject_version', 'quotation_version',
          p_version_id::text,
          format('رفض الزبون للنسخة %s: %s', v_ver.version_number, v_note), v_payload);

  v_result := jsonb_build_object(
    'version_id',     p_version_id,
    'quotation_id',   v_ver.quotation_id,
    'version_number', v_ver.version_number,
    'decision_note',  v_note,
    'was_replayed',   false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'reject_quotation_version', p_version_id::text, 'synced',
          v_payload, v_result, now());

  return v_result;
end $function$;


-- ────────────────────────────────────────────────────────────────────────────
-- الملكية والمنح — نمط البيت: المالك baytak_rpc_owner، التنفيذ لauthenticated
-- (منحة CREATE مؤقتة: نقل الملكية يشترط أن يملك المالك الجديد CREATE على
-- السكيما — درس ترحيل 0034 نفسه)
-- ────────────────────────────────────────────────────────────────────────────

grant create on schema api to baytak_rpc_owner;

alter function api.create_quotation_version(uuid, numeric, text, uuid, integer)
  owner to baytak_rpc_owner;
alter function api.send_quotation_version(uuid, uuid, integer)
  owner to baytak_rpc_owner;
alter function api.approve_quotation_version(uuid, uuid, text, integer)
  owner to baytak_rpc_owner;
alter function api.reject_quotation_version(uuid, uuid, text, integer)
  owner to baytak_rpc_owner;

revoke all on function api.create_quotation_version(uuid, numeric, text, uuid, integer) from public;
revoke all on function api.send_quotation_version(uuid, uuid, integer) from public;
revoke all on function api.approve_quotation_version(uuid, uuid, text, integer) from public;
revoke all on function api.reject_quotation_version(uuid, uuid, text, integer) from public;

grant execute on function api.create_quotation_version(uuid, numeric, text, uuid, integer) to authenticated;
grant execute on function api.send_quotation_version(uuid, uuid, integer) to authenticated;
grant execute on function api.approve_quotation_version(uuid, uuid, text, integer) to authenticated;
grant execute on function api.reject_quotation_version(uuid, uuid, text, integer) to authenticated;

revoke create on schema api from baytak_rpc_owner;
