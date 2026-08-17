-- ════════════════════════════════════════════════════════════════════
-- api.assign_tailor + api.advance_stage
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.assign_tailor(p_project_id uuid, p_tailor_id uuid, p_idempotency_key uuid, p_instructions text DEFAULT ''::text, p_due_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_code text; v_title text;
  v_assignment_id uuid;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  select p.organization_id, p.code, p.title into v_org, v_code, v_title
  from core.projects p where p.id = p_project_id and p.archived_at is null;
  if v_org is null then
    raise exception 'المشروع غير موجود.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  -- فتح أوامر الإنتاج قرار إداري (M16)
  if not private.has_role(v_org, array['admin']::core.app_role[]) then
    raise exception 'فتح أوامر الإنتاج صلاحية الأدمن وحده.' using errcode = 'BD403';
  end if;
  if not exists (select 1 from core.organization_members om
                 where om.organization_id = v_org and om.user_id = p_tailor_id
                   and om.role = 'tailor' and om.is_active) then
    raise exception 'اختر خياطًا مفعَّلًا.' using errcode = 'BD422';
  end if;

  v_payload := jsonb_build_object(
    'op', 'assign_tailor', 'user_id', v_uid,
    'project_id', p_project_id, 'tailor_id', p_tailor_id,
    'instructions', coalesce(p_instructions, ''), 'due_date', p_due_date);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- أمر إنتاج واحد لكل مشروع (قيد الجدول الفريد) - تحت قفل المشروع،
  -- وبرسالتين صادقتين: المفتوح يُدار، والمقفل لا يتكرر - تبديل الخياط
  -- عبر إسناد الأدوار لا بأمر جديد
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
  if exists (select 1 from core.tailor_assignments a
             where a.project_id = p_project_id and a.stage <> 'ready') then
    raise exception 'يوجد أمر إنتاج مفتوح لهذا المشروع - تبديل خياطه عبر إسناد الأدوار.'
      using errcode = 'BD409';
  end if;
  if exists (select 1 from core.tailor_assignments a
             where a.project_id = p_project_id) then
    raise exception 'لهذا المشروع أمر إنتاج مُقفل - المشروع الواحد أمرٌ واحد.'
      using errcode = 'BD409';
  end if;

  insert into core.tailor_assignments
    (organization_id, project_id, tailor_id, instructions, due_date)
  values (v_org, p_project_id, p_tailor_id,
          pg_catalog.btrim(coalesce(p_instructions, '')), p_due_date)
  returning id into v_assignment_id;

  perform set_config('app.rpc_context', 'on', true);
  update core.projects
     set tailor_id = p_tailor_id, status_code = 'with_tailor'
   where id = p_project_id;
  perform set_config('app.rpc_context', '', true);

  insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
  values (v_org, p_tailor_id, 'tailor_assignment', 'مشروع جديد للخياطة',
          format('%s - %s', v_title, v_code), '/tailor/' || v_assignment_id::text);

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'tailor.assign', 'tailor_assignment', v_assignment_id::text,
          'إسناد مشروع للخياط', v_payload);

  v_result := jsonb_build_object(
    'assignment_id', v_assignment_id, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'assign_tailor', v_assignment_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.advance_stage(p_assignment_id uuid, p_stage text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_project uuid; v_tailor uuid;
  v_current core.tailor_stage; v_is_admin boolean;
  v_stages text[] := array['received','cutting','sewing','ironing','qc','ready'];
  v_from integer; v_to integer; v_left integer;
  v_prj record; v_tailor_name text;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  v_to := pg_catalog.array_position(v_stages, p_stage);
  if v_to is null then
    raise exception 'مرحلة غير معروفة.' using errcode = 'BD400';
  end if;

  select a.organization_id, a.project_id, a.tailor_id, a.stage
    into v_org, v_project, v_tailor, v_current
  from core.tailor_assignments a where a.id = p_assignment_id;
  if v_org is null then
    raise exception 'أمر الإنتاج غير موجود.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  -- المرحلة يقدّمها الأدمن أو خياط الأمر نفسه
  v_is_admin := private.has_role(v_org, array['admin']::core.app_role[]);
  if not (v_is_admin
          or (private.has_role(v_org, array['tailor']::core.app_role[])
              and v_tailor = v_uid)) then
    raise exception 'تقدّم المراحل للأدمن أو خياط الأمر نفسه.' using errcode = 'BD403';
  end if;

  v_payload := jsonb_build_object(
    'op', 'advance_stage', 'user_id', v_uid,
    'assignment_id', p_assignment_id, 'stage', p_stage);

  -- بحث الإعادة قبل حُرّاس الحالة: الجواب الضائع نتيجةٌ مخزونة لا خطأ
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- الأقفال: الأمر ثم المشروع أخيرًا
  select a.stage into v_current from core.tailor_assignments a
  where a.id = p_assignment_id for update;
  select p.* into v_prj from core.projects p where p.id = v_project for update;

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

  -- خطوة واحدة في الاتجاهين لا قفزًا: القفز يترك مراحل بلا توقيت في
  -- السجل. والرجوع خطوة مسموح لأن الضغطة الخاطئة تقع.
  v_from := pg_catalog.array_position(v_stages, v_current::text);
  if pg_catalog.abs(v_to - v_from) <> 1 then
    raise exception 'المراحل تتقدّم خطوة واحدة في كل مرة.' using errcode = 'BD409';
  end if;

  -- «جاهز» يُغلق الأمر ويُطلق التركيب، فلا يصحّ قبل أن يُنهى كل شباك -
  -- وتأكيد الإنهاء هو نفسه تسجيل الاستهلاك، فلا يُقفل أمرٌ وقماشه محجوز
  if p_stage = 'ready' then
    select count(*) into v_left
    from core.windows w
    where w.project_id = v_project
      and not exists (select 1 from core.fabric_usage u where u.window_id = w.id);
    if v_left > 0 then
      raise exception 'بقي % شباك بلا تأكيد إنهاء - أكّدها قبل الإقفال.', v_left
        using errcode = 'BD409';
    end if;
  end if;

  update core.tailor_assignments
     set stage = p_stage::core.tailor_stage,
         started_at = coalesce(started_at, now()),
         -- التراجع خطوةً يمحو الإتمام: تركُه يجعل أمرًا عاد إلى الكيّ
         -- يبدو منجزًا في كل تقرير يقرأ completed_at
         completed_at = case when p_stage = 'ready' then now() else null end,
         stage_history = stage_history
           || jsonb_build_object('stage', p_stage, 'at', now())
   where id = p_assignment_id;

  if p_stage = 'ready' then
    perform set_config('app.rpc_context', 'on', true);
    update core.projects set status_code = 'ready_for_install' where id = v_project;
    perform set_config('app.rpc_context', '', true);

    -- المركّب إن أُسند وإلا فالقائس، والإدارة تعلم تلقائيًا (M18)
    if coalesce(v_prj.installer_id, v_prj.measurement_worker_id) is not null then
      insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
      values (v_org, coalesce(v_prj.installer_id, v_prj.measurement_worker_id),
              'ready_for_install', 'جاهز للتركيب',
              format('%s - حدد موعد التركيب.', v_prj.title),
              '/project/' || v_project::text);
    end if;
    select p.full_name into v_tailor_name from core.profiles p where p.id = v_tailor;
    insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
    select v_org, om.user_id, 'ready_for_install', 'الورشة جاهزة',
           format('%s أنهى %s - جاهز للتركيب.',
                  coalesce(v_tailor_name, 'الخياط'), v_prj.title),
           '/project/' || v_project::text
    from core.organization_members om
    where om.organization_id = v_org and om.role = 'admin' and om.is_active;
  elsif v_prj.status_code in ('fabric_allocated', 'ready_for_install') then
    -- ومن 'ready_for_install' يعود كذلك: التراجع عن «جاهز» كان يترك
    -- المشروع معلنًا جاهزيته بينما الأمر عاد إلى الخياطة
    perform set_config('app.rpc_context', 'on', true);
    update core.projects set status_code = 'with_tailor' where id = v_project;
    perform set_config('app.rpc_context', '', true);
  end if;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'production.stage', 'tailor_assignment', p_assignment_id::text,
          format('تحديث مرحلة الإنتاج إلى: %s', p_stage), v_payload);

  v_result := jsonb_build_object(
    'assignment_id', p_assignment_id, 'stage', p_stage, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'advance_stage', p_assignment_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;
