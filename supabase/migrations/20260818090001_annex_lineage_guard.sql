-- ════════════════════════════════════════════════════════════════════
-- نسب الملحق يُحرَس: بابٌ واحد لفتحه، ولا نقل له بعد فتحه
--
-- ‏api.projects عرضٌ قابل للإدخال والتحديث ممنوحٌ لـauthenticated، وحارسه
-- كان يراقب الحالة والقفل التفاؤلي وحدهما. فبعد إضافة عمود النسب صار
-- ممكنًا - نظريًا اليوم وعمليًا غدًا - أن يُعلَّق مشروعٌ مدفوعٌ على آخر
-- بضربة PATCH: ينتقل دفتر دفعاته إلى جذرٍ غريب، وتتبدّل صلاحية رؤيته،
-- ويصير الرصيد الذي يراه الزبون رصيدَ عائلةٍ لم يتفق عليها.
--
-- ‏١) التحديث: parent_project_id وannex_seq لا يُمسّان خارج RPC.
-- ‏٢) الإدخال: ملحقٌ لا يُولَد إلا من api.create_project_annex - فهي وحدها
--    تشترط عرضًا معتمدًا على الأصل، وتمنع ملحقًا على ملحق، وتمنع ثانيًا
--    والأول مفتوح، وتنسخ الغرف.
-- ‏٣) ولذلك تفتح الدالة سياق RPC حول إدخالها: بابها هو الباب الشرعي.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION private.guard_project_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status_code is distinct from old.status_code and not private.in_rpc() then
    raise exception 'تغيير حالة المشروع يتم عبر RPC حصرًا (الحالية %، المطلوبة %)',
      old.status_code, new.status_code using errcode = '42501';
  end if;

  -- النسب يُكتب مرةً واحدة حين يُفتح الملحق عبر RPC. api.projects عرضٌ قابل
  -- للتحديث، ولو تُرك العمود حرًّا لأمكن بضربة PATCH واحدة أن يُعلَّق مشروعٌ
  -- مدفوعٌ على آخر: ينتقل دفتره إلى جذرٍ غريب، وتتبدّل صلاحية رؤيته، ويصير
  -- الرصيد الذي يراه الزبون رصيدَ عائلةٍ لم يتفق عليها
  if (new.parent_project_id is distinct from old.parent_project_id
      or new.annex_seq is distinct from old.annex_seq)
     and not private.in_rpc() then
    raise exception 'نسب الملحق لا يُغيَّر بعد فتحه.' using errcode = '42501';
  end if;

  -- قفل تفاؤلي: كل تحديث يرفع النسخة، وأي كتابة بنسخة قديمة تُرفض
  if new.lock_version is not distinct from old.lock_version then
    new.lock_version := old.lock_version + 1;
  elsif new.lock_version <> old.lock_version + 1 then
    raise exception 'تعارض تعديل: المشروع عُدّل من جهة أخرى. أعد التحميل.'
      using errcode = '40001';
  end if;

  new.updated_at := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION private.guard_project_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- ملحقٌ يُولَد من العرض العام يتخطى كل ما يحرسه api.create_project_annex:
  -- اشتراط عرضٍ معتمد على الأصل، ومنع ملحقٍ على ملحق، ومنع ثانٍ والأول
  -- مفتوح، ونسخ الغرف. فباب الإنشاء واحد
  if new.parent_project_id is not null and not private.in_rpc() then
    raise exception 'الملحق يُفتح عبر api.create_project_annex حصرًا.'
      using errcode = '42501';
  end if;
  return new;
end $function$;

drop trigger if exists projects_annex_insert_guard on core.projects;
create trigger projects_annex_insert_guard before insert on core.projects
  for each row execute function private.guard_project_insert();

CREATE OR REPLACE FUNCTION api.create_project_annex(p_parent_project_id uuid, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_parent core.projects%rowtype;
  v_seq integer; v_code text; v_new_id uuid; v_reason text;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;
  v_reason := pg_catalog.btrim(coalesce(p_reason, ''));

  select * into v_parent from core.projects p
  where p.id = p_parent_project_id and p.archived_at is null;
  if not found then
    raise exception 'المشروع غير موجود.' using errcode = 'BD404';
  end if;
  v_org := v_parent.organization_id;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في مؤسسة هذا المشروع.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales']::core.app_role[]) then
    raise exception 'إنشاء الملاحق صلاحية الإدارة والمبيعات.' using errcode = 'BD403';
  end if;

  v_payload := jsonb_build_object(
    'op', 'create_project_annex', 'user_id', v_uid,
    'parent_project_id', p_parent_project_id, 'reason', v_reason);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  perform 1 from core.projects where id = p_parent_project_id for update;

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  select * into v_parent from core.projects p where p.id = p_parent_project_id;

  -- عمقٌ واحد: لا ملحق على ملحق، وإلا صارت شجرةً لا يفهمها أحد
  if v_parent.parent_project_id is not null then
    raise exception 'الملحق يُعلَّق على المشروع الأصل لا على ملحق آخر.'
      using errcode = 'BD409';
  end if;
  -- قبل الاعتماد لا معنى للملحق: عدّل العرض نفسه
  if not exists (
    select 1 from core.quotation_versions v
    join core.quotations q on q.id = v.quotation_id
    where q.project_id = p_parent_project_id and v.status = 'approved')
  then
    raise exception 'لا ملحق قبل اعتماد الزبون للعرض الأصلي - قبله يُعدَّل العرض نفسه.'
      using errcode = 'BD409';
  end if;
  -- والمُغلق لا يُلحق به: ذاك مشروع جديد
  if v_parent.status_code = 'completed' then
    raise exception 'المشروع مُغلق - الإضافة إليه مشروعٌ جديد لا ملحق.'
      using errcode = 'BD409';
  end if;
  -- ملحق مفتوح واحد في كل مرة: تعدّدها يُشتّت الورشة والحساب معًا
  if exists (
    select 1 from core.projects a
    where a.parent_project_id = p_parent_project_id
      and a.archived_at is null and a.status_code <> 'completed')
  then
    raise exception 'للمشروع ملحق مفتوح - أنهِه قبل فتح ملحق جديد.'
      using errcode = 'BD409';
  end if;

  select coalesce(max(a.annex_seq), 0) + 1 into v_seq
  from core.projects a where a.parent_project_id = p_parent_project_id;
  v_code := v_parent.code || '/' || v_seq::text;

  -- الملحق يرث طاقم الأصل: البيت واحد والوجوه هي هي. والإدخال يفتح سياق
  -- RPC لأن core.projects تحرس عمود النسب: هذا هو بابه الشرعي الوحيد
  perform pg_catalog.set_config('app.rpc_context', 'on', true);
  insert into core.projects
    (organization_id, customer_id, code, title, status_code, priority,
     field_worker_id, measurement_worker_id, installer_id, tailor_id,
     parent_project_id, annex_seq, annex_reason, notes)
  values (v_org, v_parent.customer_id, v_code,
          v_parent.title || ' - ملحق ' || v_seq::text,
          'measured', v_parent.priority,
          v_parent.field_worker_id, v_parent.measurement_worker_id,
          v_parent.installer_id, v_parent.tailor_id,
          p_parent_project_id, v_seq, v_reason, '')
  returning id into v_new_id;
  perform pg_catalog.set_config('app.rpc_context', '', true);

  -- غرف الأصل تُنسخ أسماءً: القائس يختار «غرفة الجلوس» فيقرأها الخياط كما
  -- كتبها، وكل استعلام يبقى مقصورًا على مشروعه كما هو
  insert into core.rooms (organization_id, project_id, name, sort_order)
  select v_org, v_new_id, r.name, r.sort_order
  from core.rooms r where r.project_id = p_parent_project_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'project.annex', 'project', v_new_id::text,
          format('ملحق %s على %s', v_code, v_parent.code), v_payload);

  -- الأدمن يعلم أن العمل اتّسع
  insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
  select v_org, om.user_id, 'discount_request', 'ملحق جديد',
         format('%s - إضافة على %s. قِس ثم سعّر.', v_code, v_parent.code),
         '/project/' || v_new_id::text
  from core.organization_members om
  where om.organization_id = v_org and om.role = 'admin' and om.is_active
    and om.user_id <> v_uid;

  v_result := jsonb_build_object(
    'annex_project_id', v_new_id, 'code', v_code, 'annex_seq', v_seq,
    'parent_project_id', p_parent_project_id, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'create_project_annex', v_new_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

alter function api.create_project_annex(uuid, text, uuid) owner to baytak_rpc_owner;
revoke all on function api.create_project_annex(uuid, text, uuid) from public, anon;
grant execute on function api.create_project_annex(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
