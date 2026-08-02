-- ============================================================================
-- بيتك ديزاين — 0016 — api.reserve_fabric
-- المرجع: database.html (مثال RPC للحجز)، inventory.html، DECISIONS.md §1
--
-- أخطر عملية في النظام. تختبر دفعة واحدة: العضوية والدور، حدّ definer/RLS،
-- التزامن، اشتقاق الرصيد، دفتر الحركة، التدقيق، وidempotency.
-- ============================================================================

-- ⚠️ استخدم الاسم الصريح للدور — لا CURRENT_USER.
--
-- في PostgreSQL 15 لا يصير مُنشئ الدور عضوًا فيه تلقائيًا (تغيّر في 16)، و
-- ALTER … OWNER TO تشترط العضوية. لكن كتابتها بصيغة:
--     grant baytak_rpc_owner to current_user;
-- **تُسقط الخادم** على هذا البناء (supabase/postgres:15.8.1.085). عزلنا العبارة
-- وأعدنا إنتاج الانهيار مرتين؛ السبب إضافة supautils التي تعترض عبارات
-- GRANT ROLE لفرض reserved_memberships ولا تعالج CURRENT_USER كمستقبِل.
-- الاسترداد كان تلقائيًا ونظيفًا بلا فقد بيانات، لكن لا تكرر الصيغة.
grant baytak_rpc_owner to postgres;

-- ALTER … OWNER TO تشترط أيضًا أن يملك المالك الجديد CREATE على السكيما.
-- 0015 منحه USAGE فقط. لا يخلق هذا سطحًا جديدًا: الدور nologin ولا تُنشئ دوالنا
-- كائنات، لكنه شرط لازم لحمل الملكية.
grant create on schema api to baytak_rpc_owner;

create or replace function api.reserve_fabric(
  p_project_id     uuid,
  p_roll_id        uuid,
  p_quantity_m     numeric,
  p_idempotency_key uuid,
  p_expected_project_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid;
  v_org         uuid;
  v_status      text;
  v_lock_ver    integer;
  v_qty         numeric(12,3);
  v_payload     jsonb;
  v_prior       core.client_operations%rowtype;
  v_on_hand     numeric(12,3);
  v_reserved    numeric(12,3);
  v_available   numeric(12,3);
  v_res_id      uuid;
  v_roll_code   text;
  v_result      jsonb;
begin
  -- ── 1) الهوية ─────────────────────────────────────────────────────────────
  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;

  -- ── تطبيع المدخلات ────────────────────────────────────────────────────────
  v_qty := pg_catalog.round(p_quantity_m, 3);
  if v_qty is null or v_qty <= 0 then
    raise exception 'الكمية يجب أن تكون أكبر من صفر.' using errcode = 'BD400';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  -- ── 2) المؤسسة تُشتق من المشروع، لا من قيمة يرسلها الجهاز ─────────────────
  select p.organization_id, p.status_code, p.lock_version
    into v_org, v_status, v_lock_ver
  from core.projects p
  where p.id = p_project_id and p.archived_at is null;

  if v_org is null then
    raise exception 'المشروع غير موجود.' using errcode = 'BD404';
  end if;

  -- ── 3) الدور ──────────────────────────────────────────────────────────────
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في مؤسسة هذا المشروع.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales']::core.app_role[]) then
    raise exception 'دورك لا يسمح بحجز القماش.' using errcode = 'BD403';
  end if;

  -- ── 4) الرول في المؤسسة نفسها ─────────────────────────────────────────────
  select r.code into v_roll_code
  from core.fabric_rolls r
  where r.id = p_roll_id and r.organization_id = v_org and r.retired_at is null;

  if v_roll_code is null then
    raise exception 'الرول غير موجود في هذه المؤسسة.' using errcode = 'BD404';
  end if;

  -- ── 5) حالة المشروع تسمح بالحجز ───────────────────────────────────────────
  if v_status not in ('customer_approved', 'fabric_allocated', 'with_tailor') then
    raise exception 'لا يمكن الحجز والمشروع في حالة "%". يلزم اعتماد الزبون أولًا.',
      v_status using errcode = 'BD409';
  end if;

  -- القفل التفاؤلي اختياري: يُفحص فقط إن أرسله العميل
  if p_expected_project_version is not null
     and p_expected_project_version <> v_lock_ver then
    raise exception 'تم تعديل المشروع من مستخدم آخر. أعد التحميل.'
      using errcode = 'BD409';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'op', 'reserve_fabric',
    'user_id', v_uid,
    'project_id', p_project_id,
    'roll_id', p_roll_id,
    'quantity_m', v_qty
  );

  -- ── 6) idempotency — الفحص الأول ──────────────────────────────────────────
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;

  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception
        'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة. استخدم مفتاحًا جديدًا.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || pg_catalog.jsonb_build_object('was_replayed', true);
  end if;

  -- ── 7) قفل الرول ──────────────────────────────────────────────────────────
  -- يسلسل كل الحجوزات على هذا الرول. أي معاملة أخرى تنتظر هنا حتى نلتزم.
  perform 1 from core.fabric_rolls where id = p_roll_id for update;

  -- الفحص الثاني: قد تكون معاملة مطابقة التزمت بينما كنا ننتظر القفل
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception
        'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.' using errcode = 'BD400';
    end if;
    return v_prior.result || pg_catalog.jsonb_build_object('was_replayed', true);
  end if;

  -- ── 8) الرصيد يُشتق من الدفتر بعد القفل ───────────────────────────────────
  select
    pg_catalog.round(coalesce(sum(case
      when m.type in ('receipt','return','adjustment_in','transfer_in')       then  m.quantity_m
      when m.type in ('consumption','damage','adjustment_out','transfer_out') then -m.quantity_m
      else 0 end), 0), 3),
    greatest(0, pg_catalog.round(coalesce(sum(case
      when m.type = 'reservation'         then  m.quantity_m
      when m.type = 'reservation_release' then -m.quantity_m
      when m.type = 'consumption'         then -m.quantity_m
      else 0 end), 0), 3))
  into v_on_hand, v_reserved
  from core.stock_movements m
  where m.roll_id = p_roll_id;

  v_available := greatest(0, pg_catalog.round(v_on_hand - v_reserved, 3));

  -- ── 9) رفض النقص ──────────────────────────────────────────────────────────
  if v_qty > v_available then
    raise exception 'الكمية المطلوبة (% م) أكبر من المتاح (% م) في الرول %.',
      v_qty, v_available, v_roll_code using errcode = 'BD422';
  end if;

  -- ── 10) الحجز ─────────────────────────────────────────────────────────────
  insert into core.fabric_reservations
    (organization_id, project_id, roll_id, quantity_m, created_by)
  values (v_org, p_project_id, p_roll_id, v_qty, v_uid)
  returning id into v_res_id;

  -- ── 11) دفتر الحركة ───────────────────────────────────────────────────────
  insert into core.stock_movements
    (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
     reason, created_by, idempotency_key)
  values (v_org, p_roll_id, 'reservation', v_qty, p_project_id, v_res_id,
          '', v_uid, p_idempotency_key);

  -- ── 12) التدقيق ───────────────────────────────────────────────────────────
  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'inventory.reserve', 'fabric_reservation', v_res_id::text,
          pg_catalog.format('حجز %s م من الرول %s', v_qty, v_roll_code),
          v_payload);

  -- ── 13) تحديث المشروع عند الحاجة ──────────────────────────────────────────
  -- الـtrigger يمنع تغيير status_code خارج RPC، فنعلن السياق.
  if v_status = 'customer_approved' then
    perform pg_catalog.set_config('app.rpc_context', 'on', true);
    update core.projects set status_code = 'fabric_allocated' where id = p_project_id;
    perform pg_catalog.set_config('app.rpc_context', '', true);
  end if;

  -- ── 14) لقطة الرصيد بعد العملية ───────────────────────────────────────────
  v_reserved  := pg_catalog.round(v_reserved + v_qty, 3);
  v_available := greatest(0, pg_catalog.round(v_on_hand - v_reserved, 3));

  v_result := pg_catalog.jsonb_build_object(
    'reservation_id',            v_res_id,
    'project_id',                p_project_id,
    'roll_id',                   p_roll_id,
    'roll_code',                 v_roll_code,
    'reserved_quantity_m',       v_qty,
    'on_hand_quantity_m',        v_on_hand,
    'total_reserved_quantity_m', v_reserved,
    'available_quantity_m',      v_available,
    'was_replayed',              false
  );

  -- ── 15) حفظ نتيجة idempotency ─────────────────────────────────────────────
  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'reserve_fabric', v_res_id::text, 'synced', v_payload, v_result,
          pg_catalog.now());

  return v_result;
end $$;

-- ملكية محدودة بدل postgres
alter function api.reserve_fabric(uuid, uuid, numeric, uuid, integer)
  owner to baytak_rpc_owner;

-- التنفيذ للمصادَق عليهم وحدهم — والدالة تعيد فحص الدور داخليًا
revoke all on function api.reserve_fabric(uuid, uuid, numeric, uuid, integer) from public, anon;
grant execute on function api.reserve_fabric(uuid, uuid, numeric, uuid, integer) to authenticated;

comment on function api.reserve_fabric(uuid, uuid, numeric, uuid, integer) is
  'حجز قماش لمشروع. المؤسسة تُشتق من المشروع لا من الجهاز. القفل FOR UPDATE '
  'يسلسل الحجوزات على الرول. الأخطاء: BD400/BD403/BD404/BD409/BD422.';

notify pgrst, 'reload schema';
