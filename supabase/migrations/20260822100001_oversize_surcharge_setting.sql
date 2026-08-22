-- ════════════════════════════════════════════════════════════════════
-- زيادة الارتفاع الكبير: الإعداد وحده (بلا أثرٍ ماليّ)
--
-- المالك: «عندما يكون المقاس 500 سم وأكثر فيزيد السعر 30% من سعر المنتج
-- + كلفة الخياط + القياس». وهذه أوّل خطوتين: العمود ووصولُه إلى اللقطة.
--
-- **لا أثر ماليًّا في هذا الترحيل**: المحرّك لا يقرأ المفتاح بعد. فالمتجهات
-- الذهبية ترجع بتّيًّا كما هي - وهذا إثباتٌ آليّ لا مراجعةُ عين. التسعير
-- نفسه يأتي في الترحيل التالي.
--
-- الافتراضي 30 لا 0: رفعُ السقف (500←800) ليس إعدادًا، فلو كان صفرًا
-- لانفتح بيعُ 500-800 بلا الزيادة - أسوأ من الحالتين. والتعرّض مقيسٌ صفرًا:
-- لا شبّاك عند 500 أو فوقه في القاعدة (أطولها 471).
--
-- ⚠️ التوقيع: إضافة وسيطٍ بقيمةٍ افتراضية تُنشئ **تحميلًا زائدًا** لا
-- استبدالًا، فيعجز PostgREST عن التمييز وتفشل كلّ تعديلات الإعدادات. لذا
-- يُسقَط التوقيع القديم (١٧ وسيطًا) أوّلًا.
-- ════════════════════════════════════════════════════════════════════

-- ── العمود: نسبةٌ كبقيّة النِسب (numeric(5,2) بحدّين) ────────────────────
alter table core.business_settings
  add column if not exists oversize_surcharge_percent numeric(5,2) not null default 30;

alter table core.business_settings
  drop constraint if exists business_settings_oversize_surcharge_percent_check;
alter table core.business_settings
  add constraint business_settings_oversize_surcharge_percent_check
  check (oversize_surcharge_percent >= 0 and oversize_surcharge_percent <= 100);

comment on column core.business_settings.oversize_surcharge_percent is
  'نسبة الزيادة على الشبابيك بارتفاع 500 سم فأكثر - تُطبَّق على سعر الزبون للمتر وأجرة الخياط والقياس والتركيب. قابلة للتعديل من الأدمن.';

-- ── العرض غير المحجوب: النسبة تقود سعر زبونٍ يعاينه المبيعات والميدان ────
-- (الجديد في الذيل حصرًا - الإحلال لا يُدرج في الوسط)
create or replace view api.business_settings
  with (security_invoker = on) as
SELECT business_settings.organization_id,
    business_settings.min_margin_percent,
    business_settings.employee_discount_limit_percent,
    business_settings.admin_discount_limit_percent,
    business_settings.quotation_validity_days,
    business_settings.vat_percent,
    business_settings.currency,
    business_settings.motorized_track_price_per_meter_agorot,
    business_settings.motor_price_agorot,
    business_settings.remote_price_agorot,
    business_settings.oversize_surcharge_percent
   FROM core.business_settings;

-- ── اللقطة تحمل المفتاح: بدونه يقرؤه المحرّك صفرًا فتصير الميزة لا شيءَ ──
-- صامتًا. التوقيع لم يتغيّر، فالإحلال يبقي المالك والمنح كما هما.
CREATE OR REPLACE FUNCTION api.create_quotation_version(p_project_id uuid, p_discount_percent numeric, p_note text, p_idempotency_key uuid, p_expected_project_version integer DEFAULT NULL::integer, p_markup jsonb DEFAULT '{}'::jsonb, p_discount_agorot bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if p_discount_agorot is not null and p_discount_agorot < 0 then
    raise exception 'مبلغ الخصم لا يكون سالبًا.' using errcode = 'BD400';
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
    'project_id', p_project_id, 'discount_percent', v_pct,
    'discount_agorot', p_discount_agorot, 'note', v_note);

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
    'vat_mode',            'exclusive',
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
        'motorized_track_cost_per_meter_agorot',  bs.motorized_track_cost_per_meter_agorot,
        'motorized_track_price_per_meter_agorot', bs.motorized_track_price_per_meter_agorot,
        'motor_cost_agorot',                     bs.motor_cost_agorot,
        'motor_price_agorot',                    bs.motor_price_agorot,
        'remote_cost_agorot',                    bs.remote_cost_agorot,
        'remote_price_agorot',                   bs.remote_price_agorot,
        'oversize_surcharge_percent',            bs.oversize_surcharge_percent,
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
     valid_until, note, markup_spec, created_by, pricing_context)
  values
    (v_org, v_quotation.id, v_ver_no, v_pct, v_valid_until, v_note,
     coalesce(p_markup, '{}'::jsonb), v_uid, v_context)
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

  -- الحيلة التسويقية: سعرٌ مُضخَّم يُعرَض «قبل الخصم» فوق السعر الحقيقي.
  -- عرضٌ فقط - لا يدخل المجموع ولا الضريبة ولا الربح؛ القيمة لكل بند من
  -- targets[category] وإلا targets.all. النسبة تُبتر إلى الشيكل كالمحرّك،
  -- والمبلغ بالشيكل يُضاف كما هو. مرآةٌ حرفية لـ markupListPriceAgorot
  if coalesce(p_markup, '{}'::jsonb) ? 'targets' then
    update core.quotation_items qi
       set list_price_agorot = case
         when (p_markup->>'mode') = 'amount'
           then qi.line_total_agorot
              + (pg_catalog.round(coalesce(
                   (p_markup->'targets'->>qi.category::text)::numeric,
                   (p_markup->'targets'->>'all')::numeric, 0)) * 100)::bigint
         else (pg_catalog.floor(
                 pg_catalog.round(qi.line_total_agorot
                   * (100 + coalesce(
                       (p_markup->'targets'->>qi.category::text)::numeric,
                       (p_markup->'targets'->>'all')::numeric, 0)) / 100.0) / 100) * 100)::bigint
       end
     where qi.version_id = v_version_id
       and coalesce(
             (p_markup->'targets'->>qi.category::text)::numeric,
             (p_markup->'targets'->>'all')::numeric, 0) > 0;
  end if;

  select coalesce(sum(line_total_agorot), 0), coalesce(sum(internal_cost_agorot), 0)
    into v_subtotal, v_internal
  from core.quotation_items where version_id = v_version_id;

  if v_subtotal = 0 then
    raise exception 'لا شبابيك مقاسة للمشروع - لا يمكن إنشاء عرض فارغ.'
      using errcode = 'BD422';
  end if;

  -- ★ كل مرحلة بشيكل صحيح: البنود صحيحة بالبناء، والخصم يُسقط كسره،
  -- فيبقى الصافي صحيحًا، والضريبة تُسقط كسرها أيضًا فيبقى المجموع صحيحًا.
  --
  -- الأسعار قبل מע"מ (قرار المالك 9.8.2026): المجموع بعد الخصم هو الإيراد
  -- كاملًا، والضريبة تُضاف عليه لا تُستخرج منه. وكانت تُستخرج، فيصل المحلَّ
  -- 491 من كل 580 يدفعها الزبون - أي أنه كان يتحمّل الضريبة من سعره.
  -- الخصم المطلق (العصا الذكية): يقف الإجمالي على الرقم بالضبط. المبلغ
  -- هو المصدر، والنسبة تُشتقّ منه لبوابة الصلاحية عند الإرسال. وحين لا يُمرَّر
  -- مبلغٌ يعمل المسار التوافقي بالنسبة كما كان.
  if p_discount_agorot is not null then
    v_discount := least(p_discount_agorot, v_subtotal);
    v_pct := case when v_subtotal > 0
                  then pg_catalog.round(v_discount::numeric / v_subtotal * 100, 2)
                  else 0 end;
  else
    v_discount := (pg_catalog.floor(v_subtotal * v_pct / 100 / 100) * 100)::bigint;
  end if;
  v_rev_ex   := v_subtotal - v_discount;
  v_vat_amt  := (pg_catalog.floor(v_rev_ex * v_vat / 100 / 100) * 100)::bigint;
  v_net      := v_rev_ex + v_vat_amt;
  v_margin   := case when v_rev_ex > 0
                     then pg_catalog.round((v_rev_ex - v_internal)::numeric / v_rev_ex * 100, 2)
                     else 0 end;

  update core.quotation_versions
     set subtotal_agorot = v_subtotal, discount_percent = v_pct,
         discount_agorot = v_discount,
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

  -- أول عرضٍ يحرّك المشروع «تم القياس» ← «عرض سعر» - كما في التطبيق،
  -- وإلا بقيت قوائم القمع تعدّ المشروع مقاسًا وعرضُه مرسل
  if v_status = 'measured' then
    perform set_config('app.rpc_context', 'on', true);
    update core.projects set status_code = 'quotation' where id = p_project_id;
    perform set_config('app.rpc_context', '', true);
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

-- ── RPC الكتابة: توقيعٌ جديد، فيُسقَط القديم أوّلًا ──────────────────────
drop function if exists api.update_business_settings(uuid, bigint, bigint, bigint, bigint, numeric, numeric, numeric, integer, numeric, bigint, bigint, bigint, bigint, bigint, bigint, bigint);

CREATE OR REPLACE FUNCTION api.update_business_settings(p_idempotency_key uuid, p_track_cost_per_meter_agorot bigint DEFAULT NULL::bigint, p_delivery_cost_per_meter_agorot bigint DEFAULT NULL::bigint, p_measure_install_cost_per_meter_agorot bigint DEFAULT NULL::bigint, p_lining_cost_per_meter_agorot bigint DEFAULT NULL::bigint, p_min_margin_percent numeric DEFAULT NULL::numeric, p_employee_discount_limit_percent numeric DEFAULT NULL::numeric, p_admin_discount_limit_percent numeric DEFAULT NULL::numeric, p_quotation_validity_days integer DEFAULT NULL::integer, p_vat_percent numeric DEFAULT NULL::numeric, p_field_visit_wage_agorot bigint DEFAULT NULL::bigint, p_motorized_track_cost_per_meter_agorot bigint DEFAULT NULL::bigint, p_motorized_track_price_per_meter_agorot bigint DEFAULT NULL::bigint, p_motor_cost_agorot bigint DEFAULT NULL::bigint, p_motor_price_agorot bigint DEFAULT NULL::bigint, p_remote_cost_agorot bigint DEFAULT NULL::bigint, p_remote_price_agorot bigint DEFAULT NULL::bigint, p_oversize_surcharge_percent numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid;
  v_emp numeric; v_adm numeric;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  -- التسعيرة قرار المالك: معرضُ الأدمن حتميًا (كنمط دفعات الطاقم)
  select om.organization_id into v_org
  from core.organization_members om
  where om.user_id = v_uid and om.role = 'admin' and om.is_active
  order by om.organization_id
  limit 1;
  if v_org is null then
    raise exception 'تعديل التسعيرة صلاحية الأدمن وحده.' using errcode = 'BD403';
  end if;

  -- القيم غير سالبة (مرآة التطبيق)، والنسب في مداها
  if least(coalesce(p_track_cost_per_meter_agorot, 0), coalesce(p_delivery_cost_per_meter_agorot, 0),
           coalesce(p_measure_install_cost_per_meter_agorot, 0), coalesce(p_lining_cost_per_meter_agorot, 0),
           coalesce(p_field_visit_wage_agorot, 0),
           coalesce(p_motorized_track_cost_per_meter_agorot, 0), coalesce(p_motorized_track_price_per_meter_agorot, 0),
           coalesce(p_motor_cost_agorot, 0), coalesce(p_motor_price_agorot, 0),
           coalesce(p_remote_cost_agorot, 0), coalesce(p_remote_price_agorot, 0)) < 0 then
    raise exception 'القيم يجب أن تكون أرقامًا غير سالبة.' using errcode = 'BD400';
  end if;
  if coalesce(p_min_margin_percent, 0) < 0 or coalesce(p_min_margin_percent, 0) > 100
     or coalesce(p_vat_percent, 0) < 0 or coalesce(p_vat_percent, 0) > 100
     or coalesce(p_employee_discount_limit_percent, 0) < 0 or coalesce(p_employee_discount_limit_percent, 0) > 100
     or coalesce(p_admin_discount_limit_percent, 0) < 0 or coalesce(p_admin_discount_limit_percent, 0) > 100
     or coalesce(p_oversize_surcharge_percent, 0) < 0 or coalesce(p_oversize_surcharge_percent, 0) > 100 then
    raise exception 'النسب بين 0 و100.' using errcode = 'BD400';
  end if;
  if p_quotation_validity_days is not null and p_quotation_validity_days <= 0 then
    raise exception 'صلاحية العرض بالأيام يجب أن تكون أكبر من صفر.' using errcode = 'BD400';
  end if;

  v_payload := jsonb_build_object(
    'op', 'update_business_settings', 'user_id', v_uid,
    'track', p_track_cost_per_meter_agorot, 'delivery', p_delivery_cost_per_meter_agorot,
    'mi', p_measure_install_cost_per_meter_agorot, 'lining', p_lining_cost_per_meter_agorot,
    'min_margin', p_min_margin_percent, 'emp_limit', p_employee_discount_limit_percent,
    'adm_limit', p_admin_discount_limit_percent, 'validity', p_quotation_validity_days,
    'vat', p_vat_percent, 'wage', p_field_visit_wage_agorot,
    'mt_cost', p_motorized_track_cost_per_meter_agorot,
    'mt_price', p_motorized_track_price_per_meter_agorot,
    'motor_cost', p_motor_cost_agorot, 'motor_price', p_motor_price_agorot,
    'remote_cost', p_remote_cost_agorot, 'remote_price', p_remote_price_agorot,
    'oversize_pct', p_oversize_surcharge_percent);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- حُرّاس الحالة بعد بحث الإعادة: الملتزَم المفقود الرد يستعيد نتيجته لا
  -- أخطاء حالةٍ تغيّرت بعده. القفل يصفّف الكتابات المتزامنة، وسقف الموظف
  -- يُفحص على القيم النهائية بعد الدمج - رسالة مصممة قبل قيد الجدول
  select coalesce(p_employee_discount_limit_percent, bs.employee_discount_limit_percent),
         coalesce(p_admin_discount_limit_percent, bs.admin_discount_limit_percent)
    into v_emp, v_adm
  from core.business_settings bs where bs.organization_id = v_org
  for update;
  if not found then
    raise exception 'إعدادات المعرض غير مهيأة على الخادم بعد.' using errcode = 'BD404';
  end if;
  if v_emp > v_adm then
    raise exception 'سقف خصم الموظف لا يتجاوز سقف الأدمن.' using errcode = 'BD400';
  end if;

  -- إعادة البحث بعد نيل القفل تصطاد سباق النقر المزدوج: المتزامن الثاني
  -- ينتظر على الصف ثم يجد عملية الأول مسجلة فيستعيدها بدل 23505
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- غياب الحقل إبقاء لا مسح. والتعديل يسري على العروض القادمة وحدها:
  -- المقفول يسعّر من لقطته الملتقطة إلى الأبد (§10)
  update core.business_settings set
    track_cost_per_meter_agorot            = coalesce(p_track_cost_per_meter_agorot, track_cost_per_meter_agorot),
    delivery_cost_per_meter_agorot         = coalesce(p_delivery_cost_per_meter_agorot, delivery_cost_per_meter_agorot),
    measure_install_cost_per_meter_agorot  = coalesce(p_measure_install_cost_per_meter_agorot, measure_install_cost_per_meter_agorot),
    lining_cost_per_meter_agorot           = coalesce(p_lining_cost_per_meter_agorot, lining_cost_per_meter_agorot),
    min_margin_percent                     = coalesce(p_min_margin_percent, min_margin_percent),
    employee_discount_limit_percent        = coalesce(p_employee_discount_limit_percent, employee_discount_limit_percent),
    admin_discount_limit_percent           = coalesce(p_admin_discount_limit_percent, admin_discount_limit_percent),
    quotation_validity_days                = coalesce(p_quotation_validity_days, quotation_validity_days),
    vat_percent                            = coalesce(p_vat_percent, vat_percent),
    field_visit_wage_agorot                = coalesce(p_field_visit_wage_agorot, field_visit_wage_agorot),
    motorized_track_cost_per_meter_agorot  = coalesce(p_motorized_track_cost_per_meter_agorot, motorized_track_cost_per_meter_agorot),
    motorized_track_price_per_meter_agorot = coalesce(p_motorized_track_price_per_meter_agorot, motorized_track_price_per_meter_agorot),
    motor_cost_agorot                      = coalesce(p_motor_cost_agorot, motor_cost_agorot),
    motor_price_agorot                     = coalesce(p_motor_price_agorot, motor_price_agorot),
    remote_cost_agorot                     = coalesce(p_remote_cost_agorot, remote_cost_agorot),
    remote_price_agorot                    = coalesce(p_remote_price_agorot, remote_price_agorot),
    oversize_surcharge_percent             = coalesce(p_oversize_surcharge_percent, oversize_surcharge_percent),
    updated_at                             = now()
  where organization_id = v_org;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'settings.update', 'business_settings', v_org::text,
          'تعديل التسعيرة من لوحة الأدمن', v_payload);

  v_result := jsonb_build_object('organization_id', v_org, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'update_business_settings', v_org::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

-- نقل ملكية دالةٍ أُعيد إنشاؤها (أُسقط توقيعها القديم) يحتاج CREATE على المخطط
grant create on schema api to baytak_rpc_owner;
alter function api.update_business_settings(uuid, bigint, bigint, bigint, bigint, numeric, numeric, numeric, integer, numeric, bigint, bigint, bigint, bigint, bigint, bigint, bigint, numeric) owner to baytak_rpc_owner;
revoke all on function api.update_business_settings(uuid, bigint, bigint, bigint, bigint, numeric, numeric, numeric, integer, numeric, bigint, bigint, bigint, bigint, bigint, bigint, bigint, numeric) from public, anon;
grant execute on function api.update_business_settings(uuid, bigint, bigint, bigint, bigint, numeric, numeric, numeric, integer, numeric, bigint, bigint, bigint, bigint, bigint, bigint, bigint, numeric) to authenticated;

revoke create on schema api from baytak_rpc_owner;

notify pgrst, 'reload schema';
