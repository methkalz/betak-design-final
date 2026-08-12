-- ════════════════════════════════════════════════════════════════════
-- api.decide_discount_request
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.decide_discount_request(p_request_id uuid, p_approve boolean, p_idempotency_key uuid, p_decision_note text DEFAULT ''::text, p_expected_project_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- صاحب الطلب يعلم القرار لحظته - كان الإشعار في التطبيق وضاع في التوصيل
  insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
  values (v_org, v_dr.requested_by, 'discount_request',
          case when p_approve then 'تمت الموافقة على الخصم' else 'تم رفض الخصم' end,
          format('طلب خصم %s%%%s', v_dr.requested_percent,
                 case when v_note <> '' then ' — ' || v_note else '' end),
          '/discounts');

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
