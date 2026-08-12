-- ════════════════════════════════════════════════════════════════════
-- api.receive_fabric_roll
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.receive_fabric_roll(p_variant_id uuid, p_meters numeric, p_idempotency_key uuid, p_location text DEFAULT NULL::text, p_assigned_tailor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid;
  v_meters numeric(12,3); v_location text;
  v_is_admin boolean; v_self boolean;
  v_sku text; v_color text; v_product text; v_tz text;
  v_code text; v_lot text; v_n integer;
  v_roll_id uuid; v_full_name text;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  v_meters := pg_catalog.round(p_meters, 3);
  if v_meters is null or v_meters <= 0 then
    raise exception 'الأمتار يجب أن تكون رقمًا أكبر من صفر.' using errcode = 'BD400';
  end if;
  if v_meters > 10000 then
    raise exception 'الكمية أكبر من أي شحنةٍ حقيقية - راجع الرقم.' using errcode = 'BD400';
  end if;

  select v.organization_id, v.sku, v.color_name, p.name
    into v_org, v_sku, v_color, v_product
  from core.fabric_variants v
  join core.fabric_products p on p.id = v.product_id
  where v.id = p_variant_id and v.archived_at is null;
  if v_org is null then
    raise exception 'اللون غير موجود.' using errcode = 'BD404';
  end if;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;

  -- مساران للاستلام (قرار المالك 11.8.2026): الأدمن يستلم لأي وجهة،
  -- والخياط لمخزونه هو حصرًا - فلا يسجّل بضاعةً على زميله أو على المعرض
  v_is_admin := private.has_role(v_org, array['admin']::core.app_role[]);
  v_self := private.has_role(v_org, array['tailor']::core.app_role[])
            and p_assigned_tailor_id = v_uid;
  if not (v_is_admin or v_self) then
    raise exception 'الاستلام يسجّله الأدمن، أو الخياط لمخزونه هو حصرًا.'
      using errcode = 'BD403';
  end if;

  if p_assigned_tailor_id is not null and not exists (
    select 1 from core.organization_members om
    where om.organization_id = v_org and om.user_id = p_assigned_tailor_id
      and om.role = 'tailor' and om.is_active
  ) then
    raise exception 'اختر خياطًا مفعَّلًا.' using errcode = 'BD422';
  end if;

  -- استلام الخياط بلا موقع مخزن: البضاعة عنده لا على رف المعرض
  v_location := case when v_self then '' else pg_catalog.btrim(coalesce(p_location, '')) end;

  v_payload := jsonb_build_object(
    'op', 'receive_fabric_roll', 'user_id', v_uid,
    'variant_id', p_variant_id, 'meters', v_meters,
    'location', v_location, 'assigned_tailor_id', p_assigned_tailor_id);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- قفل استشاري على مستوى المعرض يسلسل الاستلامات كلها: فيخرج رمز الرول
  -- ودفعة الصباغة فريدَين بلا سباق - حتى بين لونين مختلفين يستلمان في
  -- اللحظة نفسها (دفعة الصباغة تُفحص على المعرض كله لا على اللون)
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('baytak:receive_fabric_roll:' || v_org::text, 0));

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- الرمز يُقرأ في المخزن بلا فكّ شيفرة: تسلسل على رمز اللون
  v_n := (select count(*) from core.fabric_rolls
          where organization_id = v_org and variant_id = p_variant_id) + 1;
  v_code := coalesce(nullif(v_sku, ''), 'RL') || '-' || v_n;
  while exists (select 1 from core.fabric_rolls
                where organization_id = v_org and upper(code) = upper(v_code)) loop
    v_n := v_n + 1;
    v_code := coalesce(nullif(v_sku, ''), 'RL') || '-' || v_n;
  end loop;

  -- دفعة صباغة فريدة لكل استلام: تاريخ اليوم بتوقيت المعرض + تمييز
  select bs.timezone into v_tz from core.business_settings bs
  where bs.organization_id = v_org;
  v_lot := 'LOT-' || pg_catalog.to_char(now() at time zone coalesce(v_tz, 'Asia/Jerusalem'), 'YYMMDD');
  v_n := 1;
  while exists (select 1 from core.fabric_rolls
                where organization_id = v_org and dye_lot = v_lot) loop
    v_n := v_n + 1;
    v_lot := 'LOT-' || pg_catalog.to_char(now() at time zone coalesce(v_tz, 'Asia/Jerusalem'), 'YYMMDD') || '-' || v_n;
  end loop;

  insert into core.fabric_rolls
    (organization_id, variant_id, code, dye_lot, location, initial_meters, assigned_tailor_id)
  values (v_org, p_variant_id, v_code, v_lot, v_location, v_meters, p_assigned_tailor_id)
  returning id into v_roll_id;

  insert into core.stock_movements
    (organization_id, roll_id, type, quantity_m, notes, created_by, idempotency_key)
  values (v_org, v_roll_id, 'receipt', v_meters, 'استلام بضاعة', v_uid, p_idempotency_key);

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'inventory.roll.create', 'fabric_roll', v_roll_id::text,
          format('استلام رول %s بـ%s م', v_code, v_meters), v_payload);

  if v_self then
    -- الأدمن يتابع تحركات الخياط لا يوافق عليها: إشعارٌ لكل أدمن نشط،
    -- ورابطه يفتح رصيد الصنف نفسه
    select p.full_name into v_full_name from core.profiles p where p.id = v_uid;
    insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
    select v_org, om.user_id, 'stock_received',
           format('%s أضاف بضاعة لمخزونه', coalesce(v_full_name, 'الخياط')),
           format('%s م %s %s', v_meters, v_product, v_color),
           '/stock/' || p_variant_id::text
    from core.organization_members om
    where om.organization_id = v_org and om.role = 'admin' and om.is_active;
  end if;

  v_result := jsonb_build_object(
    'roll_id', v_roll_id,
    'code', v_code,
    'dye_lot', v_lot,
    'variant_id', p_variant_id,
    'meters', v_meters,
    'assigned_tailor_id', p_assigned_tailor_id,
    'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'receive_fabric_roll', v_roll_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;
