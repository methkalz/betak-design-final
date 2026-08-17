-- ════════════════════════════════════════════════════════════════════
-- api.create_project + api.update_project + api.set_project_status
-- + api.assign_project_role
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.create_project(p_customer_id uuid, p_title text, p_tailor_id uuid, p_measurement_worker_id uuid, p_idempotency_key uuid, p_priority text DEFAULT 'normal'::text, p_installer_id uuid DEFAULT NULL::uuid, p_measurement_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_notes text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_title text;
  v_seq integer; v_code text; v_project_id uuid; v_visit_id uuid;
  v_status text;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  select c.organization_id into v_org from core.customers c
  where c.id = p_customer_id and c.archived_at is null;
  if v_org is null then
    raise exception 'الزبون غير موجود.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales','field']::core.app_role[]) then
    raise exception 'دورك لا يسمح بإنشاء المشاريع.' using errcode = 'BD403';
  end if;

  v_title := pg_catalog.btrim(coalesce(p_title, ''));
  if length(v_title) < 3 then
    raise exception 'عنوان المشروع قصير جدًا.' using errcode = 'BD400';
  end if;
  if p_priority not in ('low', 'normal', 'high') then
    raise exception 'أولوية غير معروفة.' using errcode = 'BD400';
  end if;

  -- الخياط والقائس إلزاميان (قرار المالك): مشروع بلا منفّذ يقف عند أول
  -- مرحلة عمل، ومشروع بلا قائس لا تُفتح له زيارة فلا تُسجَّل مقاسات
  if not exists (select 1 from core.organization_members om
                 where om.organization_id = v_org and om.user_id = p_tailor_id
                   and om.role = 'tailor' and om.is_active) then
    raise exception 'اختر الخياط المسؤول - إلزامي لكل مشروع.' using errcode = 'BD422';
  end if;
  if not exists (select 1 from core.organization_members om
                 where om.organization_id = v_org and om.user_id = p_measurement_worker_id
                   and om.role = 'field' and om.is_active) then
    raise exception 'اختر من سيقوم بالقياس - إلزامي لكل مشروع.' using errcode = 'BD422';
  end if;
  if p_installer_id is not null and not exists (
      select 1 from core.organization_members om
      where om.organization_id = v_org and om.user_id = p_installer_id
        and om.role = 'field' and om.is_active) then
    raise exception 'عامل التركيب المختار غير مفعَّل.' using errcode = 'BD422';
  end if;

  v_payload := jsonb_build_object(
    'op', 'create_project', 'user_id', v_uid,
    'customer_id', p_customer_id, 'title', v_title, 'priority', p_priority,
    'tailor_id', p_tailor_id, 'measurement_worker_id', p_measurement_worker_id,
    'installer_id', p_installer_id, 'measurement_date', p_measurement_date,
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

  -- رمز BD-n تسلسل واحد للمعرض كله لا يعيد بدء العد سنويًا - عمود السنة
  -- في جدول التسلسلات يُثبَّت على 2000 كقيمة حارسة لهذا النوع
  insert into core.document_sequences (organization_id, doc_type, year, last_number)
  values (v_org, 'project', 2000, 1000)
  on conflict (organization_id, doc_type, year) do nothing;

  select ds.last_number + 1 into v_seq
  from core.document_sequences ds
  where ds.organization_id = v_org and ds.doc_type = 'project' and ds.year = 2000
  for update;

  update core.document_sequences set last_number = v_seq
   where organization_id = v_org and doc_type = 'project' and year = 2000;

  v_code := 'BD-' || v_seq;
  v_status := case when p_measurement_date is not null
                   then 'awaiting_measurement' else 'new_request' end;

  -- field_worker_id القديم يُروى بالقائس: عليه سياسات الرؤية القائمة
  insert into core.projects
    (organization_id, customer_id, code, title, status_code, priority,
     field_worker_id, measurement_worker_id, installer_id, tailor_id,
     measurement_date, notes)
  values
    (v_org, p_customer_id, v_code, v_title, v_status, p_priority::core.priority,
     p_measurement_worker_id, p_measurement_worker_id, p_installer_id, p_tailor_id,
     p_measurement_date, pg_catalog.btrim(coalesce(p_notes, '')))
  returning id into v_project_id;

  if p_measurement_date is not null then
    insert into core.field_visits
      (organization_id, project_id, assignee_id, type, status, scheduled_at)
    values (v_org, v_project_id, p_measurement_worker_id, 'measurement',
            'scheduled', p_measurement_date)
    returning id into v_visit_id;

    insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
    values (v_org, p_measurement_worker_id, 'visit_assigned', 'زيارة قياس جديدة',
            format('%s - %s', v_title, v_code), '/visit/' || v_visit_id::text);
  end if;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'project.create', 'project', v_project_id::text,
          format('إنشاء مشروع %s', v_code), v_payload);

  v_result := jsonb_build_object(
    'project_id', v_project_id, 'code', v_code, 'status', v_status,
    'visit_id', v_visit_id, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'create_project', v_project_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.update_project(p_project_id uuid, p_idempotency_key uuid, p_title text DEFAULT NULL::text, p_priority text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_measurement_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_installation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_expected_project_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_lock_ver integer;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  select p.organization_id into v_org from core.projects p
  where p.id = p_project_id and p.archived_at is null;
  if v_org is null then
    raise exception 'المشروع غير موجود.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales','field']::core.app_role[]) then
    raise exception 'دورك لا يسمح بتعديل المشاريع.' using errcode = 'BD403';
  end if;
  if p_title is not null and length(pg_catalog.btrim(p_title)) < 3 then
    raise exception 'عنوان المشروع قصير جدًا.' using errcode = 'BD400';
  end if;
  if p_priority is not null and p_priority not in ('low', 'normal', 'high') then
    raise exception 'أولوية غير معروفة.' using errcode = 'BD400';
  end if;

  v_payload := jsonb_build_object(
    'op', 'update_project', 'user_id', v_uid, 'project_id', p_project_id,
    'title', p_title, 'priority', p_priority, 'notes', p_notes,
    'measurement_date', p_measurement_date, 'installation_date', p_installation_date);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  select p.lock_version into v_lock_ver
  from core.projects p where p.id = p_project_id for update;
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  -- غياب الحقل إبقاءٌ لا مسح: الشاشات ترسل ما عدّلته فقط
  update core.projects
     set title = coalesce(pg_catalog.btrim(p_title), title),
         priority = coalesce(p_priority::core.priority, priority),
         notes = coalesce(p_notes, notes),
         measurement_date = coalesce(p_measurement_date, measurement_date),
         installation_date = coalesce(p_installation_date, installation_date)
   where id = p_project_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'project.update', 'project', p_project_id::text,
          'تحديث بيانات المشروع', v_payload);

  v_result := jsonb_build_object('project_id', p_project_id, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'update_project', p_project_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.set_project_status(p_project_id uuid, p_status text, p_idempotency_key uuid, p_expected_project_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_lock_ver integer;
  v_code text; v_title text; v_label text;
  v_installer uuid; v_measurer uuid; v_target uuid;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  select p.organization_id, p.code, p.title, p.installer_id, p.measurement_worker_id
    into v_org, v_code, v_title, v_installer, v_measurer
  from core.projects p where p.id = p_project_id and p.archived_at is null;
  if v_org is null then
    raise exception 'المشروع غير موجود.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  -- قرار المرحلة بيد الأدمن وحده (كما في التطبيق)
  if not private.has_role(v_org, array['admin']::core.app_role[]) then
    raise exception 'تغيير حالة المشروع صلاحية الأدمن وحده.' using errcode = 'BD403';
  end if;

  select ps.label_ar into v_label from core.project_statuses ps
  where ps.status_code = p_status;
  if v_label is null then
    raise exception 'حالة غير معروفة: %', p_status using errcode = 'BD400';
  end if;

  v_payload := jsonb_build_object(
    'op', 'set_project_status', 'user_id', v_uid,
    'project_id', p_project_id, 'status', p_status);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  select p.lock_version into v_lock_ver
  from core.projects p where p.id = p_project_id for update;
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  perform set_config('app.rpc_context', 'on', true);
  update core.projects set status_code = p_status where id = p_project_id;
  perform set_config('app.rpc_context', '', true);

  -- «جاهز للتركيب» يستهدف المركّب إن عُيّن وإلا فالقائس (M14)
  if p_status = 'ready_for_install' then
    v_target := coalesce(v_installer, v_measurer);
    if v_target is not null then
      insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
      values (v_org, v_target, 'ready_for_install', 'جاهز للتركيب',
              format('%s جاهز - حدد الموعد.', v_title), '/project/' || p_project_id::text);
    end if;
  end if;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'project.status', 'project', p_project_id::text,
          format('تحديث حالة %s إلى: %s', v_code, v_label), v_payload);

  v_result := jsonb_build_object(
    'project_id', p_project_id, 'status', p_status, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'set_project_status', p_project_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.assign_project_role(p_project_id uuid, p_worker_id uuid, p_kind text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_code text; v_title text;
  v_status text; v_measurement_date timestamptz;
  v_wanted core.app_role; v_visit_id uuid; v_label text;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;
  if p_kind not in ('measurement', 'installation', 'tailor') then
    raise exception 'نوع إسناد غير معروف: %', p_kind using errcode = 'BD400';
  end if;

  select p.organization_id, p.code, p.title, p.status_code, p.measurement_date
    into v_org, v_code, v_title, v_status, v_measurement_date
  from core.projects p where p.id = p_project_id and p.archived_at is null;
  if v_org is null then
    raise exception 'المشروع غير موجود.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  -- الإسناد صريح بيد الأدمن (M16)
  if not private.has_role(v_org, array['admin']::core.app_role[]) then
    raise exception 'إسناد الأدوار صلاحية الأدمن وحده.' using errcode = 'BD403';
  end if;

  v_wanted := case when p_kind = 'tailor' then 'tailor' else 'field' end::core.app_role;
  if not exists (select 1 from core.organization_members om
                 where om.organization_id = v_org and om.user_id = p_worker_id
                   and om.role = v_wanted and om.is_active) then
    raise exception '%', case when p_kind = 'tailor' then 'اختر خياطًا مفعَّلًا.'
                              else 'اختر عاملًا ميدانيًا مفعَّلًا.' end
      using errcode = 'BD422';
  end if;

  v_payload := jsonb_build_object(
    'op', 'assign_project_role', 'user_id', v_uid,
    'project_id', p_project_id, 'worker_id', p_worker_id, 'kind', p_kind);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- ترتيب الأقفال: الأبناء أولًا والمشروع آخرًا - عكسُه هنا كان يفتح
  -- تعانقًا مع advance_stage وschedule_visit اللتين تقفلان الابن ثم المشروع
  perform 1 from core.tailor_assignments
   where project_id = p_project_id order by id for update;
  perform 1 from core.field_visits
   where project_id = p_project_id order by id for update;
  perform 1 from core.projects where id = p_project_id for update;

  -- إعادة البحث بعد نيل الأقفال: المتزامن الثاني يجد عملية الأول مسجلة
  -- فيستعيدها بدل أن يكرّر الإسناد ويصطدم بقيد المفتاح
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  if p_kind = 'tailor' then
    update core.projects set tailor_id = p_worker_id where id = p_project_id;
    -- الورشة المفتوحة تتبع خياطها الجديد وإلا بقيت باسم من لم يعد مسؤولًا
    update core.tailor_assignments set tailor_id = p_worker_id
     where project_id = p_project_id and stage <> 'ready';
  elsif p_kind = 'measurement' then
    -- المرآة القديمة field_worker_id تتبع القائس: عليها سياسات الرؤية
    update core.projects
       set measurement_worker_id = p_worker_id, field_worker_id = p_worker_id
     where id = p_project_id;
    update core.field_visits set assignee_id = p_worker_id
     where project_id = p_project_id and type = 'measurement' and status <> 'completed';
    if not found and v_measurement_date is not null
       and v_status in ('new_request', 'awaiting_measurement') then
      insert into core.field_visits
        (organization_id, project_id, assignee_id, type, status, scheduled_at)
      values (v_org, p_project_id, p_worker_id, 'measurement', 'scheduled', v_measurement_date)
      returning id into v_visit_id;
    end if;
  else
    update core.projects set installer_id = p_worker_id where id = p_project_id;
    update core.field_visits set assignee_id = p_worker_id
     where project_id = p_project_id and type = 'installation' and status <> 'completed';
  end if;

  v_label := case p_kind when 'tailor' then 'الخياطة'
                         when 'measurement' then 'القياس'
                         else 'التركيب' end;
  insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
  values (v_org, p_worker_id,
          case when p_kind = 'tailor' then 'tailor_assignment' else 'visit_assigned' end::core.notification_kind,
          format('أُسند إليك %s', v_label),
          format('%s - %s', v_title, v_code), '/project/' || p_project_id::text);

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'project.assign', 'project', p_project_id::text,
          format('إسناد %s في %s', v_label, v_code), v_payload);

  v_result := jsonb_build_object(
    'project_id', p_project_id, 'kind', p_kind, 'worker_id', p_worker_id,
    'visit_id', v_visit_id, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'assign_project_role', p_project_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;
