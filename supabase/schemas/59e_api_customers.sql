-- ════════════════════════════════════════════════════════════════════
-- api.save_customer + api.archive_customer
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

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
