-- ════════════════════════════════════════════════════════════════════
-- api.record_payment + api.record_check_series + api.reverse_payment
-- + api.record_staff_payout
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.record_payment(p_project_id uuid, p_amount_agorot bigint, p_kind text, p_method text, p_idempotency_key uuid, p_reference text DEFAULT ''::text, p_note text DEFAULT ''::text, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_code text; v_payment_id uuid;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;
  if p_kind not in ('deposit', 'milestone', 'final') then
    raise exception 'نوع دفعة غير معروف - العكس له مساره الخاص.' using errcode = 'BD400';
  end if;
  if p_method not in ('cash', 'transfer', 'check', 'card') then
    raise exception 'طريقة دفع غير معروفة.' using errcode = 'BD400';
  end if;
  if p_amount_agorot is null or p_amount_agorot <= 0 then
    raise exception 'المبلغ يجب أن يكون أكبر من صفر.' using errcode = 'BD400';
  end if;
  if p_amount_agorot % 100 <> 0 then
    raise exception 'المبلغ بالشيكل الصحيح - لا أغورة.' using errcode = 'BD400';
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

  v_payload := jsonb_build_object(
    'op', 'record_payment', 'user_id', v_uid,
    'project_id', p_project_id, 'amount_agorot', p_amount_agorot,
    'kind', p_kind, 'method', p_method, 'reference', coalesce(p_reference, ''),
    'note', coalesce(p_note, ''), 'due_at', p_due_at);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- لا دفعة بلا عرض معتمد (DECISIONS §11): بدونه لا مبلغ متفق عليه تُقاس
  -- عليه الدفعة، فتظهر مستحقات وأرصدة لا أصل لها
  if not exists (
    select 1 from core.quotation_versions v
    join core.quotations q on q.id = v.quotation_id
    where q.project_id = p_project_id and v.status = 'approved'
  ) then
    raise exception 'لا يمكن تسجيل دفعة قبل اعتماد الزبون لعرض السعر - لا يوجد مبلغ متفق عليه بعد.'
      using errcode = 'BD409';
  end if;

  insert into core.payments
    (organization_id, project_id, amount_agorot, kind, method,
     reference, note, due_at, created_by)
  values
    (v_org, p_project_id, p_amount_agorot,
     p_kind::core.payment_kind, p_method::core.payment_method,
     pg_catalog.btrim(coalesce(p_reference, '')),
     pg_catalog.btrim(coalesce(p_note, '')), p_due_at, v_uid)
  returning id into v_payment_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'payment.record', 'payment', v_payment_id::text,
          format('تسجيل دفعة على مشروع %s', v_code), v_payload);

  v_result := jsonb_build_object('payment_id', v_payment_id, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'record_payment', v_payment_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

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

  -- الرزمة كلها في معاملة واحدة: المرجع CHK i/N يقرؤها كشف الدفعات رزمةً
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
       (v_check->>'due_at')::timestamptz, v_uid);
  end loop;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'payment.checks', 'payment', p_project_id::text,
          format('تسجيل %s شيكات بمجموع %s₪ على %s',
                 v_count, v_total / 100, v_code), v_payload);

  v_result := jsonb_build_object(
    'count', v_count, 'total_agorot', v_total, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'record_check_series', p_project_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.reverse_payment(p_payment_id uuid, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_original core.payments%rowtype;
  v_reason text; v_payment_id uuid;
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
  if v_reason = '' then
    raise exception 'سبب العكس إلزامي.' using errcode = 'BD400';
  end if;

  select * into v_original from core.payments p where p.id = p_payment_id;
  if v_original.id is null then
    raise exception 'الدفعة غير موجودة.' using errcode = 'BD404';
  end if;
  v_org := v_original.organization_id;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales']::core.app_role[]) then
    raise exception 'دورك لا يسمح بتسجيل الدفعات.' using errcode = 'BD403';
  end if;

  v_payload := jsonb_build_object(
    'op', 'reverse_payment', 'user_id', v_uid,
    'payment_id', p_payment_id, 'reason', v_reason);

  -- بحث الإعادة قبل حُرّاس الحالة: عكسٌ نجح وضاع جوابه يعود نتيجةً مخزونة
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  if v_original.kind = 'reversal' then
    raise exception 'قيد العكس لا يُعكس - سجّل دفعة جديدة إن لزم.' using errcode = 'BD409';
  end if;
  if exists (select 1 from core.payments p
             where p.reversed_payment_id = p_payment_id) then
    raise exception 'الدفعة معكوسة بالفعل.' using errcode = 'BD409';
  end if;

  insert into core.payments
    (organization_id, project_id, amount_agorot, kind, method,
     reference, note, reversed_payment_id, created_by)
  values
    (v_org, v_original.project_id, -v_original.amount_agorot,
     'reversal', v_original.method, v_original.reference, v_reason,
     p_payment_id, v_uid)
  returning id into v_payment_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'payment.reverse', 'payment', v_payment_id::text,
          format('عكس دفعة - %s', v_reason), v_payload);

  v_result := jsonb_build_object(
    'payment_id', v_payment_id, 'reversed_payment_id', p_payment_id,
    'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'reverse_payment', v_payment_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION api.record_staff_payout(p_staff_id uuid, p_amount_agorot bigint, p_idempotency_key uuid, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_name text; v_entry_id uuid;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;
  if p_amount_agorot is null or p_amount_agorot <= 0 then
    raise exception 'المبلغ يجب أن يكون أكبر من صفر.' using errcode = 'BD400';
  end if;
  if p_amount_agorot % 100 <> 0 then
    raise exception 'المبلغ بالشيكل الصحيح - لا أغورة.' using errcode = 'BD400';
  end if;

  -- معرضُ الأدمن لا أول عضوية تصادفها الخطة: قيدٌ مالي لا يحتمل عشوائية
  -- (والترتيب حتمية إضافية لعالمٍ متعدد المعارض مستقبلًا)
  select om.organization_id into v_org
  from core.organization_members om
  where om.user_id = v_uid and om.role = 'admin' and om.is_active
  order by om.organization_id
  limit 1;
  if v_org is null then
    raise exception 'دفعات الطاقم صلاحية الأدمن وحده.' using errcode = 'BD403';
  end if;
  if not exists (select 1 from core.organization_members om
                 where om.organization_id = v_org and om.user_id = p_staff_id
                   and om.is_active) then
    raise exception 'الموظف غير موجود.' using errcode = 'BD404';
  end if;
  select p.full_name into v_name from core.profiles p where p.id = p_staff_id;

  v_payload := jsonb_build_object(
    'op', 'record_staff_payout', 'user_id', v_uid,
    'staff_id', p_staff_id, 'amount_agorot', p_amount_agorot,
    'note', coalesce(p_note, ''));

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  insert into core.staff_ledger
    (organization_id, staff_id, amount_agorot, note, created_by)
  values (v_org, p_staff_id, p_amount_agorot,
          pg_catalog.btrim(coalesce(p_note, '')), v_uid)
  returning id into v_entry_id;

  -- الموظف يعلم بدفعته لحظتها (M8)
  insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
  values (v_org, p_staff_id, 'payment', 'دفعة جديدة',
          format('استلمت %s₪ من إدارة بيتك ديزاين%s.', p_amount_agorot / 100,
                 case when pg_catalog.btrim(coalesce(p_note, '')) <> ''
                      then ' - ' || pg_catalog.btrim(p_note) else '' end),
          null);

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'staff.payout', 'staff_ledger', v_entry_id::text,
          format('دفعة %s₪ إلى %s', p_amount_agorot / 100, coalesce(v_name, '')),
          v_payload);

  v_result := jsonb_build_object('entry_id', v_entry_id, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'record_staff_payout', v_entry_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;
