-- ════════════════════════════════════════════════════════════════════
-- عائلة العروض تُخطر وتحرّك القمع - ما كان في التطبيق وضاع في التوصيل
--
-- create_quotation_version: أول عرض يحرّك المشروع «تم القياس» ← «عرض
-- سعر». approve: إشعار «ورشة جديدة» للخياط المسند. request_discount:
-- إشعار لكل أدمن نشط. decide: إشعار لصاحب الطلب بالقرار وملاحظته.
-- الدوال قائمة فتُستبدل أجسامها فقط - الملكية والمنح محفوظتان.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.create_quotation_version(p_project_id uuid, p_discount_percent numeric, p_note text, p_idempotency_key uuid, p_expected_project_version integer DEFAULT NULL::integer)
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
  -- فيبقى الصافي صحيحًا، والضريبة تُسقط كسرها أيضًا فيبقى المجموع صحيحًا.
  --
  -- الأسعار قبل מע"מ (قرار المالك 9.8.2026): المجموع بعد الخصم هو الإيراد
  -- كاملًا، والضريبة تُضاف عليه لا تُستخرج منه. وكانت تُستخرج، فيصل المحلَّ
  -- 491 من كل 580 يدفعها الزبون - أي أنه كان يتحمّل الضريبة من سعره.
  v_discount := (pg_catalog.floor(v_subtotal * v_pct / 100 / 100) * 100)::bigint;
  v_rev_ex   := v_subtotal - v_discount;
  v_vat_amt  := (pg_catalog.floor(v_rev_ex * v_vat / 100 / 100) * 100)::bigint;
  v_net      := v_rev_ex + v_vat_amt;
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

CREATE OR REPLACE FUNCTION api.approve_quotation_version(p_version_id uuid, p_idempotency_key uuid, p_decision_note text DEFAULT ''::text, p_expected_project_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- M25: موافقة الزبون تعني ورشة قادمة - الخياط يعلم لحظتها لا حين
  -- يصادف الأمر في قائمته
  insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
  select v_org, p.tailor_id, 'tailor_assignment', 'ورشة جديدة',
         format('%s - وافق الزبون وسيصلك أمر الإنتاج.',
                coalesce(nullif(p.title, ''), p.code)),
         '/project/' || v_project::text
  from core.projects p
  where p.id = v_project and p.tailor_id is not null;

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

CREATE OR REPLACE FUNCTION api.request_discount(p_version_id uuid, p_reason text, p_idempotency_key uuid, p_expected_project_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_lock_ver integer;
  v_ver core.quotation_versions%rowtype;
  v_project uuid; v_reason text;
  v_pct numeric(5,2); v_emp_limit numeric;
  v_payload jsonb; v_prior core.client_operations%rowtype;
  v_fp text; v_request_id uuid;
  v_result jsonb;
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
    raise exception 'سبب طلب الخصم إلزامي.' using errcode = 'BD400';
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
    raise exception 'دورك لا يسمح بطلب الخصومات.' using errcode = 'BD403';
  end if;

  -- بصمة v3 (§10 ح-2): request_discount|version|reason — بلا expected_version
  v_payload := jsonb_build_object(
    'op', 'request_discount', 'user_id', v_uid,
    'version_id', p_version_id, 'reason', v_reason);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة. استخدم مفتاحًا جديدًا.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- إخفاق سريع غير حاسم
  if v_ver.status <> 'draft' then
    raise exception 'طلب الخصم للمسودات فقط — حالة النسخة "%".', v_ver.status
      using errcode = 'BD409';
  end if;
  v_pct := v_ver.discount_percent;
  v_emp_limit := (v_ver.pricing_context->>'employee_discount_limit_percent')::numeric;
  if v_emp_limit is null then
    raise exception 'سياق تسعير ناقص على النسخة.' using errcode = 'BD400';
  end if;
  if v_pct <= v_emp_limit then
    raise exception 'خصم % ضمن صلاحية الموظف (الحد %) — لا يلزم طلب موافقة.',
      v_pct, v_emp_limit using errcode = 'BD400';
  end if;

  -- ── الأقفال: quotation ← version ← (discount_request بالإدراج) ──────────
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

  select * into v_ver from core.quotation_versions where id = p_version_id for update;
  if v_ver.status <> 'draft' then
    raise exception 'طلب الخصم للمسودات فقط — حالة النسخة "%".', v_ver.status
      using errcode = 'BD409';
  end if;

  if exists (select 1 from core.discount_requests
             where version_id = p_version_id and status = 'pending') then
    raise exception 'يوجد طلب خصم معلّق لهذه النسخة — قرّروه أولًا.'
      using errcode = 'BD409';
  end if;

  v_fp := private.version_content_fingerprint(p_version_id);

  insert into core.discount_requests
    (organization_id, quotation_id, version_id, requested_percent,
     reason, requested_by, content_fingerprint)
  values
    (v_org, v_ver.quotation_id, p_version_id, v_pct, v_reason, v_uid, v_fp)
  returning id into v_request_id;

  -- الأدمن يقرر - فليصل الطلب إليه لحظته لا حين يفتح الشاشة صدفةً
  insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
  select v_org, om.user_id, 'discount_request',
         format('طلب خصم %s%%', v_pct), v_reason, '/discounts'
  from core.organization_members om
  where om.organization_id = v_org and om.role = 'admin' and om.is_active;

  -- ★ المشروع آخر الأقفال دائمًا
  select p.lock_version into v_lock_ver
  from core.projects p where p.id = v_project for update;
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'quotation.request_discount', 'discount_request',
          v_request_id::text,
          format('طلب خصم %s%% على النسخة %s', v_pct, v_ver.version_number),
          v_payload || jsonb_build_object('content_fingerprint', v_fp));

  v_result := jsonb_build_object(
    'request_id',          v_request_id,
    'version_id',          p_version_id,
    'quotation_id',        v_ver.quotation_id,
    'requested_percent',   v_pct,
    'content_fingerprint', v_fp,
    'status',              'pending',
    'was_replayed',        false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'request_discount', v_request_id::text, 'synced',
          v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.decide_discount_request(p_request_id uuid, p_approve boolean, p_idempotency_key uuid, p_decision_note text DEFAULT ''::text, p_expected_project_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_lock_ver integer;
  v_dr core.discount_requests%rowtype;
  v_project uuid; v_note text; v_new_status core.discount_request_status;
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
  if p_approve is null then
    raise exception 'القرار (approve) إلزامي.' using errcode = 'BD400';
  end if;
  v_note := pg_catalog.btrim(coalesce(p_decision_note, ''));

  select * into v_dr from core.discount_requests where id = p_request_id;
  if not found then
    raise exception 'طلب الخصم غير موجود.' using errcode = 'BD404';
  end if;
  v_org := v_dr.organization_id;
  select q.project_id into v_project from core.quotations q where q.id = v_dr.quotation_id;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في مؤسسة هذا العرض.' using errcode = 'BD403';
  end if;
  if not private.is_admin(v_org) then
    raise exception 'قرار طلبات الخصم للأدمن حصرًا.' using errcode = 'BD403';
  end if;

  -- بصمة v3 (§10 ح-2): decide|request|approve|note — بلا expected_version
  v_payload := jsonb_build_object(
    'op', 'decide_discount_request', 'user_id', v_uid,
    'request_id', p_request_id, 'approve', p_approve, 'decision_note', v_note);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة. استخدم مفتاحًا جديدًا.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- إخفاق سريع غير حاسم
  if v_dr.status <> 'pending' then
    raise exception 'الطلب مقرَّر سلفًا (%).', v_dr.status using errcode = 'BD409';
  end if;
  if not p_approve and v_note = '' then
    raise exception 'ملاحظة رفض الطلب إلزامية.' using errcode = 'BD422';
  end if;

  -- ── الأقفال: quotation ← discount_request ── ────────────────────────────
  perform 1 from core.quotations where id = v_dr.quotation_id for update;

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  select * into v_dr from core.discount_requests where id = p_request_id for update;
  if v_dr.status <> 'pending' then
    raise exception 'الطلب مقرَّر سلفًا (%).', v_dr.status using errcode = 'BD409';
  end if;

  v_new_status := (case when p_approve then 'approved' else 'rejected' end)::core.discount_request_status;

  update core.discount_requests
     set status = v_new_status, decided_by = v_uid, decided_at = now(),
         decision_note = v_note
   where id = p_request_id;

  -- صاحب الطلب يعلم القرار لحظته - كان الإشعار في التطبيق وضاع في التوصيل
  insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
  values (v_org, v_dr.requested_by, 'discount_request',
          case when p_approve then 'تمت الموافقة على الخصم' else 'تم رفض الخصم' end,
          format('طلب خصم %s%%%s', v_dr.requested_percent,
                 case when v_note <> '' then ' — ' || v_note else '' end),
          '/discounts');

  -- ★ المشروع آخر الأقفال دائمًا
  select p.lock_version into v_lock_ver
  from core.projects p where p.id = v_project for update;
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'quotation.decide_discount', 'discount_request',
          p_request_id::text,
          format('%s طلب خصم %s%%',
                 case when p_approve then 'اعتماد' else 'رفض' end,
                 v_dr.requested_percent),
          v_payload);

  v_result := jsonb_build_object(
    'request_id',        p_request_id,
    'version_id',        v_dr.version_id,
    'quotation_id',      v_dr.quotation_id,
    'requested_percent', v_dr.requested_percent,
    'status',            v_new_status,
    'decision_note',     v_note,
    'was_replayed',      false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'decide_discount_request', p_request_id::text, 'synced',
          v_payload, v_result, now());

  return v_result;
end $function$;

notify pgrst, 'reload schema';
