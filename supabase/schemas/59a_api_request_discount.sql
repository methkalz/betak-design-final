-- ════════════════════════════════════════════════════════════════════
-- api.request_discount
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.request_discount(p_version_id uuid, p_reason text, p_idempotency_key uuid, p_expected_project_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- الأدمن يقرر - فليصل الطلب إليه لحظته لا حين يفتح الشاشة صدفةً
  insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
  select v_org, om.user_id, 'discount_request',
         format('طلب خصم %s%%', v_pct), v_reason, '/discounts'
  from core.organization_members om
  where om.organization_id = v_org and om.role = 'admin' and om.is_active;

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
