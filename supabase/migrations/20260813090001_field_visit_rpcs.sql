-- ════════════════════════════════════════════════════════════════════
-- الزيارات الميدانية تكتب إلى الخادم: جدولة وبدء وإكمال
--
-- schedule_visit: زيارة واحدة مفتوحة من كل نوع لكل مشروع (تحت قفل
-- المشروع)، وموعده يتبعها، والإشعار يبلغ المسنَد لحظته. update_visit
-- يرقّع ما تغيّر فقط (قائمة التحقق وتوقيع الزبون والملاحظات والموعد).
-- start/complete يحرّكان المشروع بمرايا التطبيق: القياس يبدأ فينتقل
-- «طلب جديد» إلى «بانتظار القياس»، ويكتمل بشباكٍ مسجَّل فـ«تم القياس»،
-- والتركيب لا يُقفل إلا بقائمة التحقق كاملةً وتوقيع الزبون - ثم
-- «تم التركيب». النطاق can_see_project كسياسات الكتابة المباشرة.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.schedule_visit(p_project_id uuid, p_assignee_id uuid, p_type text, p_scheduled_at timestamp with time zone, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_code text; v_title text; v_visit_id uuid;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;
  if p_type not in ('measurement', 'installation') then
    raise exception 'نوع زيارة غير معروف.' using errcode = 'BD400';
  end if;
  if p_scheduled_at is null then
    raise exception 'موعد الزيارة إلزامي.' using errcode = 'BD400';
  end if;

  select p.organization_id, p.code, p.title into v_org, v_code, v_title
  from core.projects p where p.id = p_project_id and p.archived_at is null;
  if v_org is null then
    raise exception 'المشروع غير موجود.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','field']::core.app_role[]) then
    raise exception 'دورك لا يسمح بجدولة الزيارات.' using errcode = 'BD403';
  end if;
  if not private.can_see_project(v_org, p_project_id) then
    raise exception 'هذا المشروع خارج نطاق عملك.' using errcode = 'BD403';
  end if;
  if not exists (select 1 from core.organization_members om
                 where om.organization_id = v_org and om.user_id = p_assignee_id
                   and om.role = 'field' and om.is_active) then
    raise exception 'اختر عاملًا ميدانيًا مفعَّلًا.' using errcode = 'BD422';
  end if;

  v_payload := jsonb_build_object(
    'op', 'schedule_visit', 'user_id', v_uid,
    'project_id', p_project_id, 'assignee_id', p_assignee_id,
    'type', p_type, 'scheduled_at', p_scheduled_at);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- زيارة واحدة مفتوحة من كل نوع لكل مشروع - تحت قفل المشروع فلا يمرّ
  -- متزامنان من الفحص معًا
  perform 1 from core.projects where id = p_project_id for update;
  if exists (select 1 from core.field_visits v
             where v.project_id = p_project_id and v.type = p_type::core.visit_type
               and v.status <> 'completed') then
    raise exception 'توجد زيارة من هذا النوع مجدولة بالفعل لهذا المشروع.'
      using errcode = 'BD409';
  end if;

  insert into core.field_visits
    (organization_id, project_id, assignee_id, type, status, scheduled_at)
  values (v_org, p_project_id, p_assignee_id, p_type::core.visit_type,
          'scheduled', p_scheduled_at)
  returning id into v_visit_id;

  -- موعد المشروع يتبع زيارته (كما في التطبيق)
  if p_type = 'installation' then
    update core.projects set installation_date = p_scheduled_at where id = p_project_id;
  else
    update core.projects set measurement_date = p_scheduled_at where id = p_project_id;
  end if;

  insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
  values (v_org, p_assignee_id, 'visit_assigned',
          case when p_type = 'measurement' then 'زيارة قياس جديدة'
               else 'زيارة تركيب جديدة' end,
          format('%s - %s', v_title, v_code), '/visit/' || v_visit_id::text);

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'visit.schedule', 'field_visit', v_visit_id::text,
          'جدولة زيارة ميدانية', v_payload);

  v_result := jsonb_build_object(
    'visit_id', v_visit_id, 'type', p_type, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'schedule_visit', v_visit_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.update_visit(p_visit_id uuid, p_idempotency_key uuid, p_scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_notes text DEFAULT NULL::text, p_check_track boolean DEFAULT NULL::boolean, p_check_curtain boolean DEFAULT NULL::boolean, p_check_height boolean DEFAULT NULL::boolean, p_check_cleanliness boolean DEFAULT NULL::boolean, p_customer_signed_off boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_project uuid; v_status core.visit_status;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  select v.organization_id, v.project_id, v.status into v_org, v_project, v_status
  from core.field_visits v where v.id = p_visit_id;
  if v_org is null then
    raise exception 'الزيارة غير موجودة.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','field']::core.app_role[]) then
    raise exception 'دورك لا يسمح بتحديث الزيارات.' using errcode = 'BD403';
  end if;
  if not private.can_see_project(v_org, v_project) then
    raise exception 'هذا المشروع خارج نطاق عملك.' using errcode = 'BD403';
  end if;
  v_payload := jsonb_build_object(
    'op', 'update_visit', 'user_id', v_uid, 'visit_id', p_visit_id,
    'scheduled_at', p_scheduled_at, 'notes', p_notes,
    'check_track', p_check_track, 'check_curtain', p_check_curtain,
    'check_height', p_check_height, 'check_cleanliness', p_check_cleanliness,
    'customer_signed_off', p_customer_signed_off);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- حارس الحالة بعد بحث الإعادة: جوابٌ ضائع عن تعديلٍ سبق يُرَدّ نتيجةً
  -- مخزونة لا خطأً عن عمليةٍ نجحت
  if v_status = 'completed' then
    raise exception 'الزيارة مكتملة - لا تُعدَّل بعد الإقفال.' using errcode = 'BD409';
  end if;

  -- غياب الحقل إبقاء لا مسح: الشاشة ترسل ما بدّلته فقط
  update core.field_visits
     set scheduled_at = coalesce(p_scheduled_at, scheduled_at),
         notes = coalesce(p_notes, notes),
         check_track = coalesce(p_check_track, check_track),
         check_curtain = coalesce(p_check_curtain, check_curtain),
         check_height = coalesce(p_check_height, check_height),
         check_cleanliness = coalesce(p_check_cleanliness, check_cleanliness),
         customer_signed_off = coalesce(p_customer_signed_off, customer_signed_off)
   where id = p_visit_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'visit.update', 'field_visit', p_visit_id::text,
          'تحديث زيارة ميدانية', v_payload);

  v_result := jsonb_build_object('visit_id', p_visit_id, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'update_visit', p_visit_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.start_visit(p_visit_id uuid, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_project uuid;
  v_type core.visit_type; v_status core.visit_status; v_prj_status text;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  select v.organization_id, v.project_id, v.type, v.status
    into v_org, v_project, v_type, v_status
  from core.field_visits v where v.id = p_visit_id;
  if v_org is null then
    raise exception 'الزيارة غير موجودة.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','field']::core.app_role[]) then
    raise exception 'دورك لا يسمح ببدء الزيارات.' using errcode = 'BD403';
  end if;
  if not private.can_see_project(v_org, v_project) then
    raise exception 'هذا المشروع خارج نطاق عملك.' using errcode = 'BD403';
  end if;
  v_payload := jsonb_build_object(
    'op', 'start_visit', 'user_id', v_uid, 'visit_id', p_visit_id);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  if v_status <> 'scheduled' then
    raise exception 'الزيارة % - تُبدأ المجدولة فقط.',
      case v_status when 'in_progress' then 'جارية بالفعل' else 'مكتملة' end
      using errcode = 'BD409';
  end if;

  update core.field_visits
     set status = 'in_progress', started_at = now()
   where id = p_visit_id;

  -- زيارة القياس تبدأ فعليًا: مشروع «طلب جديد» ينتقل إلى «بانتظار القياس»
  select p.status_code into v_prj_status
  from core.projects p where p.id = v_project for update;
  if v_type = 'measurement' and v_prj_status = 'new_request' then
    perform set_config('app.rpc_context', 'on', true);
    update core.projects set status_code = 'awaiting_measurement' where id = v_project;
    perform set_config('app.rpc_context', '', true);
  end if;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'visit.start', 'field_visit', p_visit_id::text,
          'بدء الزيارة الميدانية', v_payload);

  v_result := jsonb_build_object('visit_id', p_visit_id, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'start_visit', p_visit_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.complete_visit(p_visit_id uuid, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_project uuid;
  v_visit core.field_visits%rowtype; v_prj_status text; v_new_status text;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  select * into v_visit from core.field_visits v where v.id = p_visit_id;
  if v_visit.id is null then
    raise exception 'الزيارة غير موجودة.' using errcode = 'BD404';
  end if;
  v_org := v_visit.organization_id; v_project := v_visit.project_id;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','field']::core.app_role[]) then
    raise exception 'دورك لا يسمح بإكمال الزيارات.' using errcode = 'BD403';
  end if;
  if not private.can_see_project(v_org, v_project) then
    raise exception 'هذا المشروع خارج نطاق عملك.' using errcode = 'BD403';
  end if;

  v_payload := jsonb_build_object(
    'op', 'complete_visit', 'user_id', v_uid, 'visit_id', p_visit_id);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- حُرّاس الحالة والإثبات بعد بحث الإعادة (جواب ضائع = نتيجة مخزونة)
  if v_visit.status = 'completed' then
    raise exception 'الزيارة مكتملة بالفعل.' using errcode = 'BD409';
  end if;
  -- إثبات الإنجاز: القياس بشباكٍ مسجَّل على الأقل، والتركيب بقائمة التحقق
  -- كاملةً وتوقيع الزبون (الصور اختيارية بقرار المالك)
  if v_visit.type = 'measurement' then
    if not exists (select 1 from core.windows w where w.project_id = v_project) then
      raise exception 'لا يمكن إكمال زيارة القياس بدون تسجيل شباك واحد على الأقل.'
        using errcode = 'BD422';
    end if;
  else
    if not (v_visit.check_track and v_visit.check_curtain
            and v_visit.check_height and v_visit.check_cleanliness) then
      raise exception 'أكمل قائمة التحقق قبل إنهاء التركيب.' using errcode = 'BD422';
    end if;
    if not v_visit.customer_signed_off then
      raise exception 'يلزم تأكيد الزبون قبل إنهاء التركيب.' using errcode = 'BD422';
    end if;
  end if;

  update core.field_visits
     set status = 'completed', completed_at = now()
   where id = p_visit_id;

  select p.status_code into v_prj_status
  from core.projects p where p.id = v_project for update;
  v_new_status := v_prj_status;
  if v_visit.type = 'measurement' and v_prj_status = 'awaiting_measurement' then
    v_new_status := 'measured';
  elsif v_visit.type = 'installation' then
    v_new_status := 'installed';
  end if;
  if v_new_status is distinct from v_prj_status then
    perform set_config('app.rpc_context', 'on', true);
    update core.projects set status_code = v_new_status where id = v_project;
    perform set_config('app.rpc_context', '', true);
  end if;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'visit.complete', 'field_visit', p_visit_id::text,
          'إكمال الزيارة الميدانية', v_payload);

  v_result := jsonb_build_object(
    'visit_id', p_visit_id, 'project_status', v_new_status, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'complete_visit', p_visit_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

-- ── الملكية والصلاحيات ──────────────────────────────────────────────────────
grant create on schema api to baytak_rpc_owner;

alter function api.schedule_visit(uuid, uuid, text, timestamptz, uuid) owner to baytak_rpc_owner;
alter function api.update_visit(uuid, uuid, timestamptz, text, boolean, boolean, boolean, boolean, boolean) owner to baytak_rpc_owner;
alter function api.start_visit(uuid, uuid) owner to baytak_rpc_owner;
alter function api.complete_visit(uuid, uuid) owner to baytak_rpc_owner;

revoke create on schema api from baytak_rpc_owner;

revoke all on function
  api.schedule_visit(uuid, uuid, text, timestamptz, uuid),
  api.update_visit(uuid, uuid, timestamptz, text, boolean, boolean, boolean, boolean, boolean),
  api.start_visit(uuid, uuid),
  api.complete_visit(uuid, uuid)
from public, anon;

grant execute on function
  api.schedule_visit(uuid, uuid, text, timestamptz, uuid),
  api.update_visit(uuid, uuid, timestamptz, text, boolean, boolean, boolean, boolean, boolean),
  api.start_visit(uuid, uuid),
  api.complete_visit(uuid, uuid)
to authenticated;

notify pgrst, 'reload schema';
