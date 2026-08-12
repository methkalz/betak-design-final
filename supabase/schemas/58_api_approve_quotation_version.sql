-- ════════════════════════════════════════════════════════════════════
-- api.approve_quotation_version
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.approve_quotation_version(p_version_id uuid, p_idempotency_key uuid, p_decision_note text DEFAULT ''::text, p_expected_project_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_status text; v_lock_ver integer;
  v_ver core.quotation_versions%rowtype;
  v_project uuid; v_current uuid; v_note text;
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
  v_note := pg_catalog.btrim(coalesce(p_decision_note, ''));

  select * into v_ver from core.quotation_versions where id = p_version_id;
  if not found then
    raise exception 'نسخة العرض غير موجودة.' using errcode = 'BD404';
  end if;
  v_org := v_ver.organization_id;
  select q.project_id, q.current_version_id into v_project, v_current
  from core.quotations q where q.id = v_ver.quotation_id;

  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في مؤسسة هذا العرض.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales']::core.app_role[]) then
    raise exception 'دورك لا يسمح بتسجيل قرار الزبون.' using errcode = 'BD403';
  end if;

  -- بصمة v3 (§10 ح-2): approve|version|note — بلا expected_version
  v_payload := jsonb_build_object(
    'op', 'approve_quotation_version', 'user_id', v_uid,
    'version_id', p_version_id, 'decision_note', v_note);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة. استخدم مفتاحًا جديدًا.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- إخفاق سريع — الفحوص الحاسمة تحت الأقفال أدناه
  if v_current is distinct from p_version_id then
    raise exception 'الاعتماد للنسخة الحالية فقط.' using errcode = 'BD409';
  end if;
  if v_ver.status <> 'sent' then
    raise exception 'الاعتماد لنسخة مرسلة فقط — الحالة "%".', v_ver.status
      using errcode = 'BD409';
  end if;

  -- ── الأقفال: quotation ← version ── ─────────────────────────────────────
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

  select q.current_version_id into v_current
  from core.quotations q where q.id = v_ver.quotation_id;
  select * into v_ver from core.quotation_versions where id = p_version_id for update;

  if v_current is distinct from p_version_id then
    raise exception 'الاعتماد للنسخة الحالية فقط.' using errcode = 'BD409';
  end if;
  if v_ver.status <> 'sent' then
    raise exception 'الاعتماد لنسخة مرسلة فقط — الحالة "%".', v_ver.status
      using errcode = 'BD409';
  end if;
  -- الانقضاء مصدر حقيقة واحد: يُفحص تحت القفل ولا يُثبَّت عرضيًا (§10 أ)
  if v_ver.valid_until < now() then
    raise exception 'انتهت صلاحية النسخة في % — أنشئ نسخة جديدة بأسعار وصلاحية جديدتين.',
      v_ver.valid_until using errcode = 'BD409';
  end if;

  update core.quotation_versions
     set status = 'approved', approved_at = now(),
         decision_recorded_by = v_uid, decision_note = v_note
   where id = p_version_id;

  update core.quotations
     set status = 'approved', updated_at = now()
   where id = v_ver.quotation_id;

  -- ★ المشروع آخر الأقفال — الاعتماد يحرّكه إلى customer_approved ذريًا
  select p.status_code, p.lock_version into v_status, v_lock_ver
  from core.projects p where p.id = v_project for update;

  if v_status not in ('measured', 'quotation') then
    raise exception 'لا يمكن الاعتماد والمشروع في حالة "%".', v_status
      using errcode = 'BD409';
  end if;
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  perform set_config('app.rpc_context', 'on', true);
  update core.projects set status_code = 'customer_approved' where id = v_project;
  perform set_config('app.rpc_context', '', true);

  -- M25: موافقة الزبون تعني ورشة قادمة - الخياط يعلم لحظتها لا حين
  -- يصادف الأمر في قائمته
  insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
  select v_org, p.tailor_id, 'tailor_assignment', 'ورشة جديدة',
         format('%s - وافق الزبون وسيصلك أمر الإنتاج.',
                coalesce(nullif(p.title, ''), p.code)),
         '/project/' || v_project::text
  from core.projects p
  where p.id = v_project and p.tailor_id is not null;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'quotation.approve_version', 'quotation_version',
          p_version_id::text,
          format('اعتماد الزبون للنسخة %s', v_ver.version_number), v_payload);

  v_result := jsonb_build_object(
    'version_id',     p_version_id,
    'quotation_id',   v_ver.quotation_id,
    'version_number', v_ver.version_number,
    'project_id',     v_project,
    'project_status', 'customer_approved',
    'was_replayed',   false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'approve_quotation_version', p_version_id::text, 'synced',
          v_payload, v_result, now());

  return v_result;
end $function$;
