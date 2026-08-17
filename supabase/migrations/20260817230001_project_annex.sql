-- ════════════════════════════════════════════════════════════════════
-- الملحق: إضافة الزبون بعد الاتفاق تصير مستندًا مسعَّرًا موقَّعًا
--
-- الزبون يضيف شباكًا أو شبابيك أثناء العمل - وهذا واقع المعرض لا استثناء.
-- كان الباب مسدودًا بصدق (العرض المعتمد لا يُمسّ)، فيصير الآن بابًا:
-- **مشروع ملحق** معلَّق على الأصل، يحمل شبابيكه وعرضه وأمر إنتاجه، ولا
-- يحمل دفترَ دفعات ولا رحلة تركيبٍ ثانية بلا داعٍ.
--
-- لماذا مشروع فرعي لا عرضٌ ثانٍ: هذا الشكل **لا يكسر قيدًا واحدًا** من
-- قيود النظام - عرضٌ واحد لكل مشروع، أمر إنتاج واحد، رفض النسخة بعد
-- الاعتماد، جمود المقفول - يلتفّ حولها بمستندٍ جديد ولا يخترقها. والبديل
-- كان يقتضي إسقاط قيدٍ مثبَّت باسمه في الاختبارات، على قاعدةٍ تحمل مال
-- الزبائن حيًّا.
--
-- ثلاث تقليمات تُبقي الواقع المادي سليمًا:
--   ١) الدفعات على الأصل وحده - **بقيدٍ في القاعدة لا بعُرف**: رصيدٌ واحد.
--   ٢) التركيب رحلة واحدة: الملحق لا يفتح زيارة ما دام الأصل لم يُركَّب.
--   ٣) الخياطة أمرٌ مستقل عمدًا: الأصل قد يكون في الكيّ حين يبدأ الملحق.
--
-- والسعر بأسعار **اليوم**: اتفاقٌ جديد بتاريخ جديد - يحمي الهامش إن ارتفع
-- القماش، ويحفظ حقّ الزبون في عرضٍ يوقّعه بنفسه.
-- ════════════════════════════════════════════════════════════════════

-- ── ١) البنية ──────────────────────────────────────────────────────────
alter table core.projects
  add column if not exists parent_project_id uuid,
  add column if not exists annex_seq integer not null default 0,
  add column if not exists annex_reason text not null default '';

-- عمقٌ واحد لا شجرة: الملحق يُعلَّق على الأصل وحده. عمود مولَّد يجعل
-- «جذر العائلة» عمودًا يُجمَّع عليه بلا وصلٍ ذاتي في كل استعلام
alter table core.projects
  add column if not exists root_project_id uuid
    generated always as (coalesce(parent_project_id, id)) stored;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_annex_parent_fkey') then
    alter table core.projects
      add constraint projects_annex_parent_fkey
      foreign key (organization_id, parent_project_id)
      references core.projects (organization_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_annex_not_self') then
    alter table core.projects
      add constraint projects_annex_not_self
      check (parent_project_id is distinct from id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_annex_seq_shape') then
    alter table core.projects
      add constraint projects_annex_seq_shape check (
        (parent_project_id is null and annex_seq = 0) or
        (parent_project_id is not null and annex_seq > 0));
  end if;
end $$;

create index if not exists projects_root_idx
  on core.projects (organization_id, root_project_id);
create index if not exists projects_parent_idx
  on core.projects (organization_id, parent_project_id)
  where parent_project_id is not null;

-- ── ٢) الدفعات على الجذر وحده - قيدٌ لا عُرف ───────────────────────────
-- رصيدٌ واحد يراه الزبون: دفترٌ ثانٍ على الملحق ليس ممنوعًا بالاتفاق بل
-- **غير قابل للتخزين**. محفّز لا قيد FK لأن الشرط يقرأ جدولًا آخر
create or replace function private.payments_target_root()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if exists (select 1 from core.projects p
             where p.id = new.project_id and p.parent_project_id is not null) then
    raise exception 'الدفعات تُسجَّل على المشروع الأصل لا على الملحق - الرصيد واحد.'
      using errcode = 'BD409';
  end if;
  return new;
end $function$;

drop trigger if exists payments_target_root on core.payments;
create trigger payments_target_root
  before insert on core.payments
  for each row execute function private.payments_target_root();

-- ── ٣) رؤية العائلة: الملحق يراه من يرى أصله ───────────────────────────
CREATE OR REPLACE FUNCTION private.can_see_project(p_org uuid, p_project uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- الملحق يتبع أصله في الرؤية: من يرى البيت يرى ما أُضيف إليه
  with target as (
    select coalesce(p.parent_project_id, p.id) as root_id
    from core.projects p where p.id = p_project and p.organization_id = p_org
  )
  select case private.role_in(p_org)
    when 'admin' then true
    when 'sales' then true
    when 'tailor' then exists (
      select 1 from core.projects p, target t
      where p.organization_id = p_org
        and (p.id = t.root_id or p.parent_project_id = t.root_id)
        and p.tailor_id = (select auth.uid())
    )
    when 'field' then exists (
      select 1 from core.projects p, target t
      where p.organization_id = p_org
        and (p.id = t.root_id or p.parent_project_id = t.root_id)
        and (p.field_worker_id = (select auth.uid())
             or p.installer_id = (select auth.uid()))
    ) or exists (
      select 1 from core.field_visits v, target t
      where v.organization_id = p_org
        and v.assignee_id = (select auth.uid())
        and (v.project_id = t.root_id
             or v.project_id in (select p2.id from core.projects p2
                                 where p2.parent_project_id = t.root_id))
    )
    else false
  end;
$function$;

-- ── ٤) إنشاء الملحق ────────────────────────────────────────────────────
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

  -- الملحق يرث طاقم الأصل: البيت واحد والوجوه هي هي
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

-- ── ٥) الأرقام الثلاثة: الأصل والملحق والإجمالي ────────────────────────
-- تُحسب على الخادم من المستندات **المعتمدة وحدها**، فيقرأ التطبيق
-- والمحاسب الرقم نفسه. المسوّدات تساهم بصفر: ما لم يوقّعه الزبون ليس دَينًا
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
)
select f.root_id as project_id,
       f.organization_id,
       coalesce(sum(a.total_agorot) filter (where not f.is_annex), 0)::bigint as original_agorot,
       coalesce(sum(a.total_agorot) filter (where f.is_annex), 0)::bigint     as annex_agorot,
       coalesce(sum(a.total_agorot), 0)::bigint                              as total_agorot,
       count(*) filter (where f.is_annex)::integer                           as annex_count
from fam f
left join approved a on a.project_id = f.project_id
group by f.root_id, f.organization_id;

grant select on api.project_family_finance to authenticated;

-- ── الملكية والصلاحيات ──────────────────────────────────────────────────
grant create on schema api to baytak_rpc_owner;
alter function api.create_project_annex(uuid, text, uuid) owner to baytak_rpc_owner;
revoke create on schema api from baytak_rpc_owner;

revoke all on function api.create_project_annex(uuid, text, uuid) from public, anon;
grant execute on function api.create_project_annex(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
