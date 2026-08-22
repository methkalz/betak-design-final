-- ════════════════════════════════════════════════════════════════════
-- api.update_business_settings + api.update_pricing_rule
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

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

CREATE OR REPLACE FUNCTION api.update_pricing_rule(p_band text, p_category text, p_customer_price_per_meter_agorot bigint, p_tailor_cost_per_meter_agorot bigint, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_rule_id uuid;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;
  if p_band not in ('standard', 'tall') then
    raise exception 'شريحة ارتفاع غير معروفة.' using errcode = 'BD400';
  end if;
  if p_category not in ('crepe_with_lining', 'crepe_without_lining',
                        'other_with_lining', 'other_without_lining') then
    raise exception 'فئة تسعير غير معروفة.' using errcode = 'BD400';
  end if;
  if p_customer_price_per_meter_agorot is null or p_customer_price_per_meter_agorot <= 0 then
    raise exception 'سعر الزبون يجب أن يكون أكبر من صفر.' using errcode = 'BD400';
  end if;
  if p_tailor_cost_per_meter_agorot is null or p_tailor_cost_per_meter_agorot < 0 then
    raise exception 'تكلفة الخياط يجب أن تكون رقمًا غير سالب.' using errcode = 'BD400';
  end if;

  select om.organization_id into v_org
  from core.organization_members om
  where om.user_id = v_uid and om.role = 'admin' and om.is_active
  order by om.organization_id
  limit 1;
  if v_org is null then
    raise exception 'تعديل التسعيرة صلاحية الأدمن وحده.' using errcode = 'BD403';
  end if;

  v_payload := jsonb_build_object(
    'op', 'update_pricing_rule', 'user_id', v_uid,
    'band', p_band, 'category', p_category,
    'customer_price', p_customer_price_per_meter_agorot,
    'tailor_cost', p_tailor_cost_per_meter_agorot);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  update core.pricing_rules
     set customer_price_per_meter_agorot = p_customer_price_per_meter_agorot,
         tailor_cost_per_meter_agorot    = p_tailor_cost_per_meter_agorot,
         updated_at                      = now()
   where organization_id = v_org
     and band = p_band::core.height_band
     and category = p_category::core.pricing_category
  returning id into v_rule_id;
  if v_rule_id is null then
    raise exception 'قاعدة التسعير غير موجودة - راجع إعدادات المعرض.' using errcode = 'BD404';
  end if;

  -- إعادة البحث بعد قفل التحديث الضمني تصطاد سباق النقر المزدوج: المتزامن
  -- الثاني ينتظر على الصف ثم يجد عملية الأول مسجلة فيستعيدها بدل 23505
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'pricing.update', 'pricing_rule', v_rule_id::text,
          'تعديل قاعدة تسعير', v_payload);

  v_result := jsonb_build_object('rule_id', v_rule_id, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'update_pricing_rule', v_rule_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;
