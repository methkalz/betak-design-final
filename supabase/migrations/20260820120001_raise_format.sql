-- ‏RAISE في PostgreSQL يستبدل % لا %s - فكانت رسالة السقف تطبع «saless».
-- اصطادها مسبار الإنتاج المرتجَع. الإحلال يبقي المالك والمنح كما هما.

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
    raise exception 'دور % لا يملك هذه الصلاحية أصلًا - لرفعها غيّر الدور.', v_target_role
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
