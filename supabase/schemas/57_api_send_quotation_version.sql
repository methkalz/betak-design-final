-- ════════════════════════════════════════════════════════════════════
-- api.send_quotation_version
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.send_quotation_version(p_version_id uuid, p_idempotency_key uuid, p_expected_project_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_status text; v_lock_ver integer;
  v_ver core.quotation_versions%rowtype;
  v_project uuid;
  v_payload jsonb; v_prior core.client_operations%rowtype;
  v_ctx jsonb;
  v_emp_limit numeric; v_admin_limit numeric; v_min_margin numeric;
  v_is_admin boolean;
  v_dr core.discount_requests%rowtype;
  v_fp text;
  v_superseded_sent uuid;
  v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
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
    raise exception 'دورك لا يسمح بإرسال عروض الأسعار.' using errcode = 'BD403';
  end if;

  -- بصمة v3 (§10 ح-2): send|version — بلا expected_version
  v_payload := jsonb_build_object(
    'op', 'send_quotation_version', 'user_id', v_uid, 'version_id', p_version_id);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة. استخدم مفتاحًا جديدًا.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  if v_ver.status <> 'draft' then
    raise exception 'الإرسال للمسودات فقط — حالة النسخة الحالية "%".', v_ver.status
      using errcode = 'BD409';
  end if;

  -- ── الأقفال: quotation ← version(s) ── (لا عداد هنا) ────────────────────
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

  -- الفحص الحاسم تحت القفل
  select * into v_ver from core.quotation_versions where id = p_version_id for update;
  if v_ver.status <> 'draft' then
    raise exception 'الإرسال للمسودات فقط — حالة النسخة "%".', v_ver.status
      using errcode = 'BD409';
  end if;

  v_ctx := v_ver.pricing_context;
  v_emp_limit   := (v_ctx->>'employee_discount_limit_percent')::numeric;
  v_admin_limit := (v_ctx->>'admin_discount_limit_percent')::numeric;
  v_min_margin  := (v_ctx->>'min_margin_percent')::numeric;
  v_is_admin    := private.is_admin(v_org);

  -- بوابة الهامش الأدنى — سقف مطلق لا يكسره أي مسار خصم (§10 هـ)
  if v_ver.margin_percent < v_min_margin then
    raise exception 'الهامش % أقل من الحد الأدنى % — لا إرسال تحت الحد مهما كان الخصم.',
      v_ver.margin_percent, v_min_margin using errcode = 'BD422';
  end if;

  -- بوابة الخصم (§10 ب): المصفوفة الرباعية على حدود السياق المجمّد
  if v_ver.discount_percent > v_emp_limit then
    if v_ver.discount_percent <= v_admin_limit and v_is_admin then
      null;  -- الأدمن ضمن حده يمرّ مباشرة
    else
      -- sales فوق حد الموظف، أو أي أحد فوق حد الأدمن (Override موثق)
      select * into v_dr from core.discount_requests dr
      where dr.version_id = p_version_id
        and dr.status = 'approved'
        and dr.requested_percent = v_ver.discount_percent
      order by dr.decided_at desc limit 1;

      if not found then
        raise exception 'خصم % يتجاوز صلاحيتك — يلزم طلب خصم معتمد من الأدمن بنفس النسبة.',
          v_ver.discount_percent using errcode = 'BD403';
      end if;

      -- صلاحية الموافقة مربوطة بالمحتوى (§10 ب + ح-1)
      v_fp := private.version_content_fingerprint(p_version_id);
      if v_dr.content_fingerprint <> v_fp then
        raise exception 'تغيّر محتوى النسخة بعد موافقة الخصم — أعد طلب الموافقة على المحتوى الحالي.'
          using errcode = 'BD409';
      end if;
    end if;
  end if;

  -- استبدال المرسلة السابقة (أختام الإرسال الحقيقية تبقى — الشكل يسمح)
  update core.quotation_versions
     set status = 'superseded', superseded_at = now()
   where quotation_id = v_ver.quotation_id and status = 'sent'
  returning id into v_superseded_sent;

  update core.quotation_versions
     set status = 'sent', sent_at = now(), sent_by = v_uid, locked = true
   where id = p_version_id;

  -- المؤشر والأب — ذريًا في نفس المعاملة (اعتراض 1)
  update core.quotations
     set current_version_id = p_version_id, status = 'sent', updated_at = now()
   where id = v_ver.quotation_id;

  -- ★ المشروع آخر الأقفال دائمًا
  select p.status_code, p.lock_version into v_status, v_lock_ver
  from core.projects p where p.id = v_project for update;

  if v_status not in ('measured', 'quotation') then
    raise exception 'لا يمكن الإرسال والمشروع في حالة "%".', v_status
      using errcode = 'BD409';
  end if;
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  v_fp := coalesce(v_fp, private.version_content_fingerprint(p_version_id));

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'quotation.send_version', 'quotation_version',
          p_version_id::text,
          format('إرسال النسخة %s للزبون', v_ver.version_number),
          v_payload || jsonb_build_object('content_fingerprint', v_fp));

  v_result := jsonb_build_object(
    'version_id',          p_version_id,
    'quotation_id',        v_ver.quotation_id,
    'version_number',      v_ver.version_number,
    'superseded_sent_id',  v_superseded_sent,
    'content_fingerprint', v_fp,
    'was_replayed',        false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'send_quotation_version', p_version_id::text, 'synced',
          v_payload, v_result, now());

  return v_result;
end $function$;
