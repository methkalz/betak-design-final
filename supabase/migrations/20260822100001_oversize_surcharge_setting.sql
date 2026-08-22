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
