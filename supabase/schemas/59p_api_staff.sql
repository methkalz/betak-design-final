-- ════════════════════════════════════════════════════════════════════
-- بوابة حسابات الطاقم: إنشاءٌ وتعطيلٌ ودورٌ وصلاحياتٌ وكلمة سر
--
-- كانت هذه الأفعال ترفض بصدق («يُنشئه مزوّد النظام») لأن إنشاء حساب دخولٍ
-- يمسّ auth.users - وقد أثبت سكربت البذرة على الإنتاج أن الإدراج المباشر
-- يعمل متى احتُرم عقد GoTrue: أعمدة الرموز '' لا NULL، وصفُّ هويةٍ لكل
-- حساب (عمود identities.email مُولَّد فلا يُدرَج). هذا هو النمط نفسه
-- مغلَّفًا بحارس الأدمن والمفتاح الواحد.
--
-- والصلاحيات على قاعدة السقف: **الدور يرسم السقف والأدمن يُطفئ ما تحته**.
-- التجاوز فوق الدور لا يُخزَّن أصلًا - من أراد أن يمنح أكثر يرفع الدور،
-- فتسري القاعدة على الخادم كله فورًا لا على شاشةٍ وحدها.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.create_staff(p_full_name text, p_phone text, p_role text, p_password text, p_idempotency_key uuid, p_title text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_new uuid;
  v_digits text; v_local text; v_email text; v_role core.app_role;
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
  order by om.organization_id
  limit 1;
  if v_org is null then
    raise exception 'إدارة الحسابات صلاحية الأدمن وحده.' using errcode = 'BD403';
  end if;

  if pg_catalog.length(pg_catalog.btrim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'اسم الموظف مطلوب.' using errcode = 'BD400';
  end if;
  if pg_catalog.length(coalesce(p_password, '')) < 4 then
    raise exception 'كلمة السر أربعة أحرف على الأقل.' using errcode = 'BD400';
  end if;
  begin
    v_role := p_role::core.app_role;
  exception when others then
    raise exception 'الدور غير معروف.' using errcode = 'BD400';
  end;

  -- الهاتف هو الهوية: يُطبَّع كما يطبّعه التطبيق (052/52/+972 → 972…)
  v_digits := pg_catalog.regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if v_digits like '972%' and pg_catalog.length(v_digits) = 12 then
    v_local := '0' || pg_catalog.substr(v_digits, 4);
  elsif v_digits like '05%' and pg_catalog.length(v_digits) = 10 then
    v_local := v_digits;
  elsif v_digits like '5%' and pg_catalog.length(v_digits) = 9 then
    v_local := '0' || v_digits;
  else
    raise exception 'رقم الهاتف غير صالح - رقم إسرائيلي يبدأ بـ05.' using errcode = 'BD400';
  end if;
  v_email := '972' || pg_catalog.ltrim(v_local, '0') || '@baytak.local';

  v_payload := jsonb_build_object(
    'op', 'create_staff', 'user_id', v_uid, 'full_name', pg_catalog.btrim(p_full_name),
    'phone', v_local, 'role', p_role, 'title', coalesce(p_title, ''));

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD409';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- قفل على الهوية: نقرتان متزامنتان لا تلدان حسابين بنفس الرقم
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('baytak:create_staff:' || v_email, 0));

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  if exists (
    select 1 from core.profiles p
    join core.organization_members m on m.user_id = p.id
    where m.organization_id = v_org
      and pg_catalog.regexp_replace(p.phone, '\D', '', 'g') = v_local
  ) or exists (select 1 from auth.users u where u.email = v_email) then
    raise exception 'يوجد حساب بهذا الرقم بالفعل.' using errcode = 'BD409';
  end if;

  -- عقد GoTrue كما أثبته الإنتاج: أعمدة الرموز '' لا NULL، وصف هوية لكل حساب
  v_new := gen_random_uuid();
  insert into auth.users
    (id, instance_id, aud, role, email, encrypted_password,
     email_confirmed_at, created_at, updated_at, raw_user_meta_data,
     confirmation_token, recovery_token, email_change, email_change_token_new,
     email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values
    (v_new, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     v_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
     now(), now(), now(),
     jsonb_build_object('full_name', pg_catalog.btrim(p_full_name), 'phone', v_local),
     '', '', '', '', '', '', '', '');

  insert into auth.identities
    (id, provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
  values
    (gen_random_uuid(), v_new::text, v_new,
     jsonb_build_object('sub', v_new::text, 'email', v_email, 'email_verified', true),
     'email', now(), now(), now());

  insert into core.profiles (id, full_name, phone, title)
  values (v_new, pg_catalog.btrim(p_full_name),
          pg_catalog.substr(v_local, 1, 3) || '-' || pg_catalog.substr(v_local, 4),
          coalesce(pg_catalog.btrim(p_title), ''));

  insert into core.organization_members (organization_id, user_id, role, is_active, capability_overrides)
  values (v_org, v_new, v_role, true, '{}'::jsonb);

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'staff.create', 'profile', v_new::text,
          format('إضافة موظف: %s (%s)', pg_catalog.btrim(p_full_name), p_role), v_payload);

  v_result := jsonb_build_object(
    'user_id', v_new, 'phone', pg_catalog.substr(v_local, 1, 3) || '-' || pg_catalog.substr(v_local, 4),
    'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'create_staff', v_new::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

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

CREATE OR REPLACE FUNCTION api.set_staff_role(p_user_id uuid, p_role text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_name text; v_role core.app_role;
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
  -- خفضُ الأدمن نفسَه يقفل المعرض بلا إدارة - بابٌ لا يُفتح
  if p_user_id = v_uid then
    raise exception 'دورك أنت لا يُغيَّر من هنا.' using errcode = 'BD422';
  end if;
  begin
    v_role := p_role::core.app_role;
  exception when others then
    raise exception 'الدور غير معروف.' using errcode = 'BD400';
  end;

  select p.full_name into v_name
  from core.organization_members om join core.profiles p on p.id = om.user_id
  where om.organization_id = v_org and om.user_id = p_user_id;
  if v_name is null then
    raise exception 'الموظف غير موجود في معرضك.' using errcode = 'BD404';
  end if;

  v_payload := jsonb_build_object(
    'op', 'set_staff_role', 'user_id', v_uid, 'target', p_user_id, 'role', p_role);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD409';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- الدور الجديد سقفٌ جديد: الإيقافات القديمة تحته تُمحى فلا تطارد صاحبها
  -- من دورٍ سابق بقاعدةٍ لم يعد لها معنى
  update core.organization_members
     set role = v_role, capability_overrides = '{}'::jsonb
   where organization_id = v_org and user_id = p_user_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'staff.role', 'profile', p_user_id::text,
          format('تغيير دور %s إلى %s', v_name, p_role), v_payload);

  v_result := jsonb_build_object('user_id', p_user_id, 'role', p_role, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'set_staff_role', p_user_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.set_staff_capability(p_user_id uuid, p_capability text, p_allowed boolean, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_name text; v_target_role core.app_role;
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
  -- إيقاف الأدمن صلاحياتِه هو يقفل الباب من الداخل
  if p_user_id = v_uid then
    raise exception 'صلاحياتك أنت لا تُعدَّل من هنا.' using errcode = 'BD422';
  end if;
  if p_capability is null or not private.capability_known(p_capability) then
    raise exception 'الصلاحية غير معروفة.' using errcode = 'BD400';
  end if;

  select om.role, p.full_name into v_target_role, v_name
  from core.organization_members om join core.profiles p on p.id = om.user_id
  where om.organization_id = v_org and om.user_id = p_user_id;
  if v_name is null then
    raise exception 'الموظف غير موجود في معرضك.' using errcode = 'BD404';
  end if;

  -- الدور يرسم السقف: ما لا يملكه الدور لا يوجد ما يُطفأ منه، ورفعُ
  -- الصلاحية فوق الدور طريقُه رفعُ الدور - فتسري القاعدة على الخادم كله
  if not private.capability_can(v_target_role, p_capability) then
    raise exception 'دور %s لا يملك هذه الصلاحية أصلًا - لرفعها غيّر الدور.', v_target_role
      using errcode = 'BD422';
  end if;

  v_payload := jsonb_build_object(
    'op', 'set_staff_capability', 'user_id', v_uid, 'target', p_user_id,
    'capability', p_capability, 'allowed', p_allowed);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD409';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- تُخزَّن الإيقافات وحدها: {capability: false}. السماح = محو الإيقاف،
  -- فبنية البيانات نفسها لا تعرف «منحًا فوق الدور»
  update core.organization_members
     set capability_overrides = case
       when coalesce(p_allowed, true) then capability_overrides - p_capability
       else capability_overrides || jsonb_build_object(p_capability, false)
     end
   where organization_id = v_org and user_id = p_user_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'staff.capability', 'profile', p_user_id::text,
          format('%s صلاحية «%s» لـ%s',
                 case when coalesce(p_allowed, true) then 'إعادة' else 'إيقاف' end,
                 p_capability, v_name), v_payload);

  v_result := jsonb_build_object(
    'user_id', p_user_id, 'capability', p_capability,
    'allowed', coalesce(p_allowed, true), 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'set_staff_capability', p_user_id::text, 'synced', v_payload, v_result, now());

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

  -- كلمة السر لا تدخل الحمولة: تُبصَم لا تُدوَّن
  v_payload := jsonb_build_object(
    'op', 'reset_staff_password', 'user_id', v_uid, 'target', p_user_id,
    'pw_hash', pg_catalog.md5(p_password));

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
