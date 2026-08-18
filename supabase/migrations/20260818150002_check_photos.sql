-- ════════════════════════════════════════════════════════════════════
-- صور الشيكات: كل صورةٍ على شيكها، ولا يراها إلا من يرى المال
--
-- ‏١) عمود payment_id على المرفقات + قيده وفهرسه الجزئي: الصورة تتبع
--    الشيك لا الرزمة، فيراها من يفتح ذلك الشيك بعينه.
-- ‏٢) حارسٌ يمنع تعليق صورةٍ على دفعةِ مشروعٍ آخر - وإلا صارت الصورة
--    بابًا خلفيًا لقراءة مالِ مشروعٍ لا يُرى.
-- ‏٣) السياستان تُقصران صور الشيكات على الإدارة والمبيعات: صورة الشيك
--    فيها حساب الزبون البنكي وتوقيعه، والخياط والميداني يريان المشروع
--    ولا يريان ماله. باقي المرفقات على حالها.
-- ‏٤) ‏record_check_series تعيد معرّفات الشيكات بترتيبها، فيعرف التطبيق
--    أيَّ صورةٍ يعلّق على أيِّ شيك.
-- ════════════════════════════════════════════════════════════════════

alter table core.attachments add column if not exists payment_id uuid;

alter table core.attachments drop constraint if exists attachments_organization_id_payment_id_fkey;
alter table core.attachments
  add constraint attachments_organization_id_payment_id_fkey
  foreign key (organization_id, payment_id)
  references core.payments(organization_id, id) on delete restrict;

create index if not exists attachments_payment_idx
  on core.attachments (organization_id, payment_id) where payment_id is not null;

CREATE OR REPLACE FUNCTION private.guard_attachment_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- صورةٌ تُعلَّق على دفعةٍ يجب أن تكون دفعةَ مشروعها: بدون هذا يستطيع من
  -- يرى مشروعًا أن يُلحق صورةً بدفعةِ مشروعٍ آخر، فتُقرأ من هناك
  if new.payment_id is not null and not exists (
       select 1 from core.payments y
        where y.id = new.payment_id
          and y.organization_id = new.organization_id
          and y.project_id = new.project_id) then
    raise exception 'الصورة تُعلَّق على دفعةٍ من المشروع نفسه.' using errcode = 'BD422';
  end if;
  return new;
end $function$;

drop trigger if exists attachments_payment_guard on core.attachments;
create trigger attachments_payment_guard before insert or update on core.attachments
  for each row execute function private.guard_attachment_payment();

create or replace view api.attachments
  with (security_invoker = on) as
SELECT attachments.id AS attachment_id,
    attachments.organization_id,
    attachments.project_id,
    attachments.room_id,
    attachments.window_id,
    attachments.visit_id,
    attachments.kind,
    attachments.storage_path,
    attachments.caption,
    attachments.byte_size,
    attachments.created_by,
    attachments.created_at,
    -- الإحلال يُلحق في الذيل ولا يُدرج في الوسط: عمودٌ جديد يأتي آخرًا
    attachments.payment_id
   FROM core.attachments;

drop policy if exists "read attachments of visible projects" on core.attachments;
create policy "read attachments of visible projects" on core.attachments
  for select to authenticated
  using (private.can_see_project(organization_id, project_id)
         and (kind <> 'check'::core.attachment_kind
              or private.has_role(organization_id,
                   array['admin'::core.app_role, 'sales'::core.app_role])));

drop policy if exists "upload to visible projects" on core.attachments;
create policy "upload to visible projects" on core.attachments
  for insert to authenticated
  with check (created_by = (select auth.uid())
              and private.can_see_project(organization_id, project_id)
              and (kind <> 'check'::core.attachment_kind
                   or private.has_role(organization_id,
                        array['admin'::core.app_role, 'sales'::core.app_role])));

CREATE OR REPLACE FUNCTION api.record_check_series(p_project_id uuid, p_checks jsonb, p_idempotency_key uuid, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_code text;
  v_count integer; v_total bigint := 0; v_i integer := 0;
  v_check jsonb; v_amount bigint; v_due timestamptz;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
  v_payment_id uuid; v_payment_ids jsonb := '[]'::jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;
  if p_checks is null or pg_catalog.jsonb_typeof(p_checks) <> 'array'
     or pg_catalog.jsonb_array_length(p_checks) = 0 then
    raise exception 'أدخل شيكًا واحدًا على الأقل.' using errcode = 'BD400';
  end if;

  select p.organization_id, p.code into v_org, v_code
  from core.projects p where p.id = p_project_id and p.archived_at is null;
  if v_org is null then
    raise exception 'المشروع غير موجود.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales']::core.app_role[]) then
    raise exception 'دورك لا يسمح بتسجيل الدفعات.' using errcode = 'BD403';
  end if;

  v_count := pg_catalog.jsonb_array_length(p_checks);
  for v_check in select * from pg_catalog.jsonb_array_elements(p_checks) loop
    v_amount := (v_check->>'amount_agorot')::bigint;
    v_due := (v_check->>'due_at')::timestamptz;
    if v_amount is null or v_amount <= 0 then
      raise exception 'كل شيك يجب أن يكون مبلغه أكبر من صفر.' using errcode = 'BD400';
    end if;
    if v_amount % 100 <> 0 then
      raise exception 'المبلغ بالشيكل الصحيح - لا أغورة.' using errcode = 'BD400';
    end if;
    if v_due is null then
      raise exception 'لكل شيك موعد صرفه.' using errcode = 'BD400';
    end if;
    v_total := v_total + v_amount;
  end loop;

  v_payload := jsonb_build_object(
    'op', 'record_check_series', 'user_id', v_uid,
    'project_id', p_project_id, 'checks', p_checks, 'note', coalesce(p_note, ''));

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  if not exists (
    select 1 from core.quotation_versions v
    join core.quotations q on q.id = v.quotation_id
    where q.project_id = p_project_id and v.status = 'approved'
  ) then
    raise exception 'لا يمكن تسجيل دفعة قبل اعتماد الزبون لعرض السعر - لا يوجد مبلغ متفق عليه بعد.'
      using errcode = 'BD409';
  end if;

  perform 1 from core.projects where id = p_project_id for update;

  -- إعادة البحث بعد القفل: المتزامن الثاني ينتظر هنا فيجد عملية الأول
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- الرزمة كلها في معاملة واحدة: المرجع CHK i/N يقرؤها كشف الدفعات رزمةً.
  -- والمعرّفات تُعاد بترتيبها لأن صورة الشيك تُعلَّق على شيكها لا على الرزمة
  for v_check in select * from pg_catalog.jsonb_array_elements(p_checks) loop
    v_i := v_i + 1;
    insert into core.payments
      (organization_id, project_id, amount_agorot, kind, method,
       reference, note, due_at, created_by)
    values
      (v_org, p_project_id, (v_check->>'amount_agorot')::bigint,
       'milestone', 'check',
       format('CHK %s/%s', v_i, v_count),
       pg_catalog.btrim(coalesce(p_note, '')),
       (v_check->>'due_at')::timestamptz, v_uid)
    returning id into v_payment_id;
    v_payment_ids := v_payment_ids || pg_catalog.to_jsonb(v_payment_id);
  end loop;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'payment.checks', 'payment', p_project_id::text,
          format('تسجيل %s شيكات بمجموع %s₪ على %s',
                 v_count, v_total / 100, v_code), v_payload);

  v_result := jsonb_build_object(
    'count', v_count, 'total_agorot', v_total,
    'payment_ids', v_payment_ids, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'record_check_series', p_project_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

alter function api.record_check_series(uuid, jsonb, uuid, text) owner to baytak_rpc_owner;
revoke all on function api.record_check_series(uuid, jsonb, uuid, text) from public, anon;
grant execute on function api.record_check_series(uuid, jsonb, uuid, text) to authenticated;

notify pgrst, 'reload schema';
