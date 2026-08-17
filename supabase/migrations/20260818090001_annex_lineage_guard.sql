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

-- ‏٤) العرض يجيب عن الرصيد لا عن الإجمالي وحده: كان يعطي أرقام المستندات
--    ثلاثةً بلا مدفوعٍ ولا متبقٍّ، فيُحسب الرصيد في التطبيق وحده - ومحاسب
--    المعرض يقرأ القاعدة لا الشاشة. عمودان يُضافان في الذيل (الإحلال يسمح
--    بالإضافة لا بإعادة الترتيب)، فيصير العرض مصدرَ الرقم والتطبيق مرآته
create or replace view api.project_family_finance
  with (security_invoker = on) as
with fam as (
  select p.id as project_id, p.organization_id,
         coalesce(p.parent_project_id, p.id) as root_id,
         p.parent_project_id is not null as is_annex
  from core.projects p where p.archived_at is null
),
approved as (
  select q.project_id, sum(v.total_agorot) as total_agorot
  from core.quotation_versions v
  join core.quotations q on q.id = v.quotation_id
  where v.status = 'approved'
  group by q.project_id
),
-- الدفتر على الجذر بقيدٍ في القاعدة، فجمعُ صفّ الجذر وحده هو حصيلة العائلة
paid as (
  select y.project_id, sum(y.amount_agorot) as paid_agorot
  from core.payments y
  group by y.project_id
)
select f.root_id as project_id,
       f.organization_id,
       coalesce(sum(a.total_agorot) filter (where not f.is_annex), 0)::bigint as original_agorot,
       coalesce(sum(a.total_agorot) filter (where f.is_annex), 0)::bigint     as annex_agorot,
       coalesce(sum(a.total_agorot), 0)::bigint                              as total_agorot,
       count(*) filter (where f.is_annex)::integer                           as annex_count,
       coalesce(sum(pd.paid_agorot) filter (where not f.is_annex), 0)::bigint as paid_agorot,
       greatest(coalesce(sum(a.total_agorot), 0)
                - coalesce(sum(pd.paid_agorot) filter (where not f.is_annex), 0), 0)::bigint
                                                                             as due_agorot
from fam f
left join approved a on a.project_id = f.project_id
left join paid pd on pd.project_id = f.project_id
group by f.root_id, f.organization_id;

grant select on api.project_family_finance to authenticated;

-- ‏٥) السفرة الواحدة تُنهي البيت كله. جدولة تركيبٍ للملحق ممنوعة ما دام أصله
--    لم يُركَّب، فإكمال زيارة الأصل يرفع ملاحقه الجاهزة معه. ولولا ذلك بقي
--    الملحق عند «جاهز للتركيب» أبدًا: لا زيارةٌ تُفتح له ولا حالةٌ تتقدّم به
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

    -- السفرة الواحدة تُنهي البيت كله: جدولة تركيبٍ للملحق ممنوعة ما دام أصله
    -- لم يُركَّب - فهما يُركَّبان معًا. ولو رُفع الأصل وحده لبقي الملحق عند
    -- «جاهز للتركيب» أبدًا، لا زيارةٌ تُفتح له ولا حالةٌ تتقدّم به: عُلِّقت
    -- شبابيك الزبون وبقي مستنده مفتوحًا في وجه المالك
    if v_visit.type = 'installation' then
      update core.projects
         set status_code = 'installed'
       where parent_project_id = v_project
         and organization_id = v_org
         and status_code = 'ready_for_install';
    end if;
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

alter function api.complete_visit(uuid, uuid) owner to baytak_rpc_owner;
revoke all on function api.complete_visit(uuid, uuid) from public, anon;
grant execute on function api.complete_visit(uuid, uuid) to authenticated;

-- ‏٦) توحيد نصّ حارس الدفتر مع مخططه التصريحي: الترحيل الأول كتبه بلا تعليقه
--    فاختلفت بصمتا القاعدتين - والتعليق ليس زينةً هنا، هو الذي يقول لماذا
--    كان محفّزًا لا قيدًا
CREATE OR REPLACE FUNCTION private.payments_target_root()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- رصيدٌ واحد يراه الزبون: دفترٌ على الملحق ليس ممنوعًا بالاتفاق بل غير
  -- قابل للتخزين. محفّز لا قيد FK لأن الشرط يقرأ جدولًا آخر
  if exists (select 1 from core.projects p
             where p.id = new.project_id and p.parent_project_id is not null) then
    raise exception 'الدفعات تُسجَّل على المشروع الأصل لا على الملحق - الرصيد واحد.'
      using errcode = 'BD409';
  end if;
  return new;
end $function$;

notify pgrst, 'reload schema';
