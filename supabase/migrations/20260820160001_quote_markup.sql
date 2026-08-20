-- ════════════════════════════════════════════════════════════════════
-- الحيلة التسويقية: سعرٌ مُضخَّم يُعرَض «قبل الخصم» فوق السعر الحقيقي
--
-- عرضٌ فقط لا يمسّ ما يدفعه الزبون ولا الربح ولا الصلاحية. المحرّك
-- `price_project_windows` **دون تغيير** (المتجهات الذهبية تبقى) - الزيادة
-- تُحسب بعده في الـRPC لكل بند من `markup_spec` (نسبة/مبلغ لكل تصنيف أو الكل).
--
-- ‏١) عمود `list_price_agorot` على البنود (السعر المُضخَّم المجمَّد، 0=بلا زيادة).
-- ‏٢) عمود `markup_spec` على النسخة (مصدرٌ للعرض وإعادة التحرير).
-- ‏٣) العرضان يكشفان العمودين (في الذيل - الإحلال لا يُدرج في الوسط).
-- ‏٤) الـRPC يقبل p_markup ويحسب list_price. توقيعٌ جديد (وسيطٌ إضافي)،
--    فيُسقَط القديم أولًا لئلا يبقى تحميلٌ زائد.
-- ════════════════════════════════════════════════════════════════════

alter table core.quotation_items
  add column if not exists list_price_agorot bigint not null default 0;
alter table core.quotation_items
  drop constraint if exists quotation_items_list_price_agorot_check;
alter table core.quotation_items
  add constraint quotation_items_list_price_agorot_check check (list_price_agorot >= 0);

alter table core.quotation_versions
  add column if not exists markup_spec jsonb not null default '{}'::jsonb;

create or replace view api.quotation_items
  with (security_invoker = on) as
SELECT i.id AS item_id,
    i.organization_id,
    i.version_id,
    i.window_id,
    i.room_name,
    i.window_name,
    i.description,
    i.width_cm,
    i.height_cm,
    i.running_meters,
    i.quantity,
    i.category,
    i.band,
    i.unit_price_agorot,
    i.line_total_agorot,
    i.fabric_meters,
    i.lining_meters,
    i.sort_order,
    i.list_price_agorot
   FROM core.quotation_items i;

create or replace view api.quotation_versions
  with (security_invoker = on) as
SELECT ver.id AS version_id,
    ver.organization_id,
    ver.quotation_id,
    ver.version_number,
    ver.status,
    ver.subtotal_agorot,
    ver.discount_percent,
    ver.discount_agorot,
    ver.vat_agorot,
    ver.total_agorot,
    ver.valid_until,
    ver.valid_until < now() AS is_expired,
    ver.note,
    ver.created_by,
    ver.created_at,
    ver.sent_at,
    ver.approved_at,
    ver.locked,
    ver.rejected_at,
    ver.superseded_at,
    ver.sent_by,
    ver.decision_recorded_by,
    ver.decision_note,
        CASE
            WHEN ver.status = 'sent'::core.quotation_status AND ver.valid_until < now() THEN 'expired'::core.quotation_status
            ELSE ver.status
        END AS effective_status,
    ver.markup_spec
   FROM core.quotation_versions ver;

drop function if exists api.create_quotation_version(uuid, numeric, text, uuid, integer);

CREATE OR REPLACE FUNCTION api.create_quotation_version(p_project_id uuid, p_discount_percent numeric, p_note text, p_idempotency_key uuid, p_expected_project_version integer DEFAULT NULL::integer, p_markup jsonb DEFAULT '{}'::jsonb)
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

alter function api.create_quotation_version(uuid, numeric, text, uuid, integer, jsonb) owner to baytak_rpc_owner;
revoke all on function api.create_quotation_version(uuid, numeric, text, uuid, integer, jsonb) from public, anon;
grant execute on function api.create_quotation_version(uuid, numeric, text, uuid, integer, jsonb) to authenticated;

notify pgrst, 'reload schema';
