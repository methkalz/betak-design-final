-- ════════════════════════════════════════════════════════════════════
-- إكمال الملحق: كشف أعمدته في العرض، ورحلة تركيبٍ واحدة للبيت
--
-- ١) api.projects تكشف parent_project_id وannex_seq وannex_reason
--    وroot_project_id - بدونها لا يرى التطبيق ملحقًا ولا يجمع عائلة.
-- ٢) schedule_visit ترفض زيارة تركيبٍ للملحق ما دام أصله لم يُركَّب:
--    يُركَّبان معًا في السفرة نفسها. وإن كان الأصل قد رُكِّب فعلًا فالرحلة
--    الثانية واقعٌ مادي لا خيار برمجي، فتُفتح ويُحتسب أجر الميداني عليها.
-- ════════════════════════════════════════════════════════════════════

create or replace view api.projects
  with (security_invoker = on) as
SELECT projects.id AS project_id,
    projects.organization_id,
    projects.customer_id,
    projects.code,
    projects.title,
    projects.status_code,
    projects.priority,
    projects.field_worker_id,
    projects.tailor_id,
    projects.measurement_date,
    projects.installation_date,
    projects.notes,
    projects.created_at,
    projects.updated_at,
    projects.archived_at,
    projects.lock_version,
    projects.measurement_worker_id,
    projects.installer_id,
    projects.parent_project_id,
    projects.annex_seq,
    projects.annex_reason,
    projects.root_project_id
   FROM core.projects;

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

  -- إعادة البحث بعد نيل القفل: المتزامن الثاني ينتظر هنا ثم يجد عملية
  -- الأول مسجلة فيستعيدها بدل أن يكرّر الكتابة أو يصطدم بقيد المفتاح
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;
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

  -- رحلة تركيب واحدة للبيت: الملحق لا يفتح زيارته ما دام الأصل لم يُركَّب
  -- بعد - يُركَّبان معًا في السفرة نفسها. وإن كان الأصل قد رُكِّب فعلًا فالرحلة
  -- الثانية واقعٌ مادي لا خيار برمجي، فتُفتح ويُحتسب أجر الميداني عليها بحق
  if p_type = 'installation' then
    if exists (
      select 1 from core.projects a
      join core.projects r on r.id = a.parent_project_id
      where a.id = p_project_id
        and r.status_code not in ('installed', 'completed'))
    then
      raise exception 'التركيب يُجدوَل على المشروع الأصل - الملحق يُركَّب معه في السفرة نفسها.'
        using errcode = 'BD409';
    end if;
  end if;

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

notify pgrst, 'reload schema';
