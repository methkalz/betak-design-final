-- ============================================================================
-- دالتا الخصم — آخر وحدة في طبقة العروض (§10 ب + ح-2 + ملحق عقد الخصم)
--
--   api.request_discount(version, reason)        — admin+sales، مسودة حصرًا،
--     النسبة من النسخة نفسها (لا نسبة من العميل)، بصمة fp1 تُلتقط هنا،
--     طلب معلّق واحد لكل نسخة (فهرس جزئي فريد).
--   api.decide_discount_request(request, approve) — admin فقط، pending حصرًا،
--     الرفض يوجب ملاحظة. لا فحص بصمة هنا — فحصها الملزم عند الإرسال.
--
-- ترتيب الأقفال المثبَّت نصًا قبل البناء (§10 ز):
--   document_sequences → quotation → version(s) → discount_request → project
-- والإرسال يقرأ الطلب المعتمد بلا قفل عمدًا: القرار أحادي الاتجاه
-- (decision_is_complete) فلا سباق يُفسد.
-- ============================================================================

create unique index discount_requests_one_pending_idx
  on core.discount_requests (organization_id, version_id)
  where status = 'pending';

comment on index core.discount_requests_one_pending_idx is
  'طلب خصم معلّق واحد لكل نسخة — قيد لا عُرف (§10 ملحق عقد الخصم).';


-- ────────────────────────────────────────────────────────────────────────────
-- api.request_discount
-- ────────────────────────────────────────────────────────────────────────────

create or replace function api.request_discount(
  p_version_id uuid,
  p_reason text,
  p_idempotency_key uuid,
  p_expected_project_version integer default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid; v_org uuid; v_lock_ver integer;
  v_ver core.quotation_versions%rowtype;
  v_project uuid; v_reason text;
  v_pct numeric(5,2); v_emp_limit numeric;
  v_payload jsonb; v_prior core.client_operations%rowtype;
  v_fp text; v_request_id uuid;
  v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;
  v_reason := pg_catalog.btrim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'سبب طلب الخصم إلزامي.' using errcode = 'BD400';
  end if;

  select * into v_ver from core.quotation_versions where id = p_version_id;
  if not found then
    raise exception 'نسخة العرض غير موجودة.' using errcode = 'BD404';
  end if;
  v_org := v_ver.organization_id;
  select q.project_id into v_project from core.quotations q where q.id = v_ver.quotation_id;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في مؤسسة هذا العرض.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales']::core.app_role[]) then
    raise exception 'دورك لا يسمح بطلب الخصومات.' using errcode = 'BD403';
  end if;

  -- بصمة v3 (§10 ح-2): request_discount|version|reason — بلا expected_version
  v_payload := jsonb_build_object(
    'op', 'request_discount', 'user_id', v_uid,
    'version_id', p_version_id, 'reason', v_reason);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة. استخدم مفتاحًا جديدًا.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- إخفاق سريع غير حاسم
  if v_ver.status <> 'draft' then
    raise exception 'طلب الخصم للمسودات فقط — حالة النسخة "%".', v_ver.status
      using errcode = 'BD409';
  end if;
  v_pct := v_ver.discount_percent;
  v_emp_limit := (v_ver.pricing_context->>'employee_discount_limit_percent')::numeric;
  if v_emp_limit is null then
    raise exception 'سياق تسعير ناقص على النسخة.' using errcode = 'BD400';
  end if;
  if v_pct <= v_emp_limit then
    raise exception 'خصم % ضمن صلاحية الموظف (الحد %) — لا يلزم طلب موافقة.',
      v_pct, v_emp_limit using errcode = 'BD400';
  end if;

  -- ── الأقفال: quotation ← version ← (discount_request بالإدراج) ──────────
  perform 1 from core.quotations where id = v_ver.quotation_id for update;

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  select * into v_ver from core.quotation_versions where id = p_version_id for update;
  if v_ver.status <> 'draft' then
    raise exception 'طلب الخصم للمسودات فقط — حالة النسخة "%".', v_ver.status
      using errcode = 'BD409';
  end if;

  if exists (select 1 from core.discount_requests
             where version_id = p_version_id and status = 'pending') then
    raise exception 'يوجد طلب خصم معلّق لهذه النسخة — قرّروه أولًا.'
      using errcode = 'BD409';
  end if;

  v_fp := private.version_content_fingerprint(p_version_id);

  insert into core.discount_requests
    (organization_id, quotation_id, version_id, requested_percent,
     reason, requested_by, content_fingerprint)
  values
    (v_org, v_ver.quotation_id, p_version_id, v_pct, v_reason, v_uid, v_fp)
  returning id into v_request_id;

  -- ★ المشروع آخر الأقفال دائمًا
  select p.lock_version into v_lock_ver
  from core.projects p where p.id = v_project for update;
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'quotation.request_discount', 'discount_request',
          v_request_id::text,
          format('طلب خصم %s%% على النسخة %s', v_pct, v_ver.version_number),
          v_payload || jsonb_build_object('content_fingerprint', v_fp));

  v_result := jsonb_build_object(
    'request_id',          v_request_id,
    'version_id',          p_version_id,
    'quotation_id',        v_ver.quotation_id,
    'requested_percent',   v_pct,
    'content_fingerprint', v_fp,
    'status',              'pending',
    'was_replayed',        false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'request_discount', v_request_id::text, 'synced',
          v_payload, v_result, now());

  return v_result;
end $function$;


-- ────────────────────────────────────────────────────────────────────────────
-- api.decide_discount_request
-- ────────────────────────────────────────────────────────────────────────────

create or replace function api.decide_discount_request(
  p_request_id uuid,
  p_approve boolean,
  p_idempotency_key uuid,
  p_decision_note text default '',
  p_expected_project_version integer default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid; v_org uuid; v_lock_ver integer;
  v_dr core.discount_requests%rowtype;
  v_project uuid; v_note text; v_new_status core.discount_request_status;
  v_payload jsonb; v_prior core.client_operations%rowtype;
  v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;
  if p_approve is null then
    raise exception 'القرار (approve) إلزامي.' using errcode = 'BD400';
  end if;
  v_note := pg_catalog.btrim(coalesce(p_decision_note, ''));

  select * into v_dr from core.discount_requests where id = p_request_id;
  if not found then
    raise exception 'طلب الخصم غير موجود.' using errcode = 'BD404';
  end if;
  v_org := v_dr.organization_id;
  select q.project_id into v_project from core.quotations q where q.id = v_dr.quotation_id;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في مؤسسة هذا العرض.' using errcode = 'BD403';
  end if;
  if not private.is_admin(v_org) then
    raise exception 'قرار طلبات الخصم للأدمن حصرًا.' using errcode = 'BD403';
  end if;

  -- بصمة v3 (§10 ح-2): decide|request|approve|note — بلا expected_version
  v_payload := jsonb_build_object(
    'op', 'decide_discount_request', 'user_id', v_uid,
    'request_id', p_request_id, 'approve', p_approve, 'decision_note', v_note);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة. استخدم مفتاحًا جديدًا.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- إخفاق سريع غير حاسم
  if v_dr.status <> 'pending' then
    raise exception 'الطلب مقرَّر سلفًا (%).', v_dr.status using errcode = 'BD409';
  end if;
  if not p_approve and v_note = '' then
    raise exception 'ملاحظة رفض الطلب إلزامية.' using errcode = 'BD422';
  end if;

  -- ── الأقفال: quotation ← discount_request ── ────────────────────────────
  perform 1 from core.quotations where id = v_dr.quotation_id for update;

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  select * into v_dr from core.discount_requests where id = p_request_id for update;
  if v_dr.status <> 'pending' then
    raise exception 'الطلب مقرَّر سلفًا (%).', v_dr.status using errcode = 'BD409';
  end if;

  v_new_status := (case when p_approve then 'approved' else 'rejected' end)::core.discount_request_status;

  update core.discount_requests
     set status = v_new_status, decided_by = v_uid, decided_at = now(),
         decision_note = v_note
   where id = p_request_id;

  -- ★ المشروع آخر الأقفال دائمًا
  select p.lock_version into v_lock_ver
  from core.projects p where p.id = v_project for update;
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'quotation.decide_discount', 'discount_request',
          p_request_id::text,
          format('%s طلب خصم %s%%',
                 case when p_approve then 'اعتماد' else 'رفض' end,
                 v_dr.requested_percent),
          v_payload);

  v_result := jsonb_build_object(
    'request_id',        p_request_id,
    'version_id',        v_dr.version_id,
    'quotation_id',      v_dr.quotation_id,
    'requested_percent', v_dr.requested_percent,
    'status',            v_new_status,
    'decision_note',     v_note,
    'was_replayed',      false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'decide_discount_request', p_request_id::text, 'synced',
          v_payload, v_result, now());

  return v_result;
end $function$;


-- ────────────────────────────────────────────────────────────────────────────
-- الملكية والمنح — نمط البيت (منحة CREATE مؤقتة لنقل الملكية)
-- ────────────────────────────────────────────────────────────────────────────

grant create on schema api to baytak_rpc_owner;

alter function api.request_discount(uuid, text, uuid, integer)
  owner to baytak_rpc_owner;
alter function api.decide_discount_request(uuid, boolean, uuid, text, integer)
  owner to baytak_rpc_owner;

revoke all on function api.request_discount(uuid, text, uuid, integer) from public;
revoke all on function api.decide_discount_request(uuid, boolean, uuid, text, integer) from public;

grant execute on function api.request_discount(uuid, text, uuid, integer) to authenticated;
grant execute on function api.decide_discount_request(uuid, boolean, uuid, text, integer) to authenticated;

revoke create on schema api from baytak_rpc_owner;
