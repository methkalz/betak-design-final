-- تصويبات ذيل تدقيق بوابة الحسابات:
-- ١) set_staff_active: NULL في p_active كان يسقط بـ23502 خام - يُردّ نظيفًا.
-- ٢) reset_staff_password: md5(كلمة السر) في الحمولة قابل للكسر بجدول قوس
--    قزح والحمولة تُقرأ في السجل - يُستبدل بطابع زمني لا يميّز إلا العملية.
-- الإحلال يبقي المالك (postgres) والمنح كما هما.

CREATE OR REPLACE FUNCTION api.set_staff_active(p_user_id uuid, p_active boolean, p_idempotency_key uuid)
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

  select om.organization_id into v_org
  from core.organization_members om
  where om.user_id = v_uid and om.role = 'admin' and om.is_active
  order by om.organization_id limit 1;
  if v_org is null then
    raise exception 'إدارة الحسابات صلاحية الأدمن وحده.' using errcode = 'BD403';
  end if;
  if p_active is null then
    raise exception 'حدّد التفعيل أو التعطيل.' using errcode = 'BD400';
  end if;
  if p_user_id = v_uid then
    raise exception 'لا يمكنك تعطيل حسابك أنت.' using errcode = 'BD422';
  end if;

  select p.full_name into v_name
  from core.organization_members om join core.profiles p on p.id = om.user_id
  where om.organization_id = v_org and om.user_id = p_user_id;
  if v_name is null then
    raise exception 'الموظف غير موجود في معرضك.' using errcode = 'BD404';
  end if;

  v_payload := jsonb_build_object(
    'op', 'set_staff_active', 'user_id', v_uid, 'target', p_user_id, 'active', p_active);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD409';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  update core.organization_members
     set is_active = p_active
   where organization_id = v_org and user_id = p_user_id;

  -- التعطيل يقفل الباب لا الشاشة وحدها: يُحظر الحساب وتُمحى جلساته، فلا
  -- يجدَّد رمزُ دخولٍ بعدها. والحارس على الخادم يرفضه فورًا حتى قبل ذلك
  -- لأن كل RPC يفحص is_active
  update auth.users
     set banned_until = case when p_active then null else '3000-01-01'::timestamptz end,
         updated_at = now()
   where id = p_user_id;
  if not p_active then
    delete from auth.refresh_tokens where user_id = p_user_id::text;
    delete from auth.sessions where user_id = p_user_id;
  end if;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, case when p_active then 'staff.activate' else 'staff.deactivate' end,
          'profile', p_user_id::text,
          format('%s حساب %s', case when p_active then 'تفعيل' else 'تعطيل' end, v_name), v_payload);

  v_result := jsonb_build_object('user_id', p_user_id, 'active', p_active, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'set_staff_active', p_user_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.reset_staff_password(p_user_id uuid, p_password text, p_idempotency_key uuid)
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

  select om.organization_id into v_org
  from core.organization_members om
  where om.user_id = v_uid and om.role = 'admin' and om.is_active
  order by om.organization_id limit 1;
  if v_org is null then
    raise exception 'إدارة الحسابات صلاحية الأدمن وحده.' using errcode = 'BD403';
  end if;
  if pg_catalog.length(coalesce(p_password, '')) < 4 then
    raise exception 'كلمة السر أربعة أحرف على الأقل.' using errcode = 'BD400';
  end if;

  select p.full_name into v_name
  from core.organization_members om join core.profiles p on p.id = om.user_id
  where om.organization_id = v_org and om.user_id = p_user_id;
  if v_name is null then
    raise exception 'الموظف غير موجود في معرضك.' using errcode = 'BD404';
  end if;

  -- كلمة السر لا تدخل الحمولة ولا بصمتها: md5(كلمة سر) قابل للكسر بجدول
  -- قوس قزح، وحمولة العملية تُقرأ في السجل والتدقيق. المفتاح وحده يميّز
  -- الإعادة، والوقت يميّز العمليتين المتطابقتين على المستخدم نفسه
  v_payload := jsonb_build_object(
    'op', 'reset_staff_password', 'user_id', v_uid, 'target', p_user_id,
    'at', pg_catalog.clock_timestamp());

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD409';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user_id;

  -- الجلسات القديمة تسقط: من بدّل السرَّ أراد قطعَ من يحمله القديم
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.sessions where user_id = p_user_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'staff.password', 'profile', p_user_id::text,
          format('تغيير كلمة سر %s', v_name), v_payload);

  v_result := jsonb_build_object('user_id', p_user_id, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'reset_staff_password', p_user_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

notify pgrst, 'reload schema';
