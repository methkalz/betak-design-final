-- ════════════════════════════════════════════════════════════════════
-- البقايا تتحول Mini Roll على الخادم (TRACEABILITY بند 5 - يُغلق)
--
-- تحويل لا خلق: ما يدخل الميني رول يخرج من أصله بحركتين مجمّعتين
-- (transfer_out/transfer_in تحت operation_group_id واحد)، بسقف المتاح
-- الصارم تحت قفل الرول. البقايا ترث دفعة الصبغ والمكان والخياط -
-- تُخاط مع أصلها بلا فرقٍ يُرى. الرمز أصل الرمز + M مرقّمة تحت قفل
-- receive الاستشاري نفسه: فضاء الرموز واحد. لا منح جداول جديدة.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.create_mini_roll(p_source_roll_id uuid, p_quantity_m numeric, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_qty numeric(12,3);
  v_src core.fabric_rolls%rowtype;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
  v_bal record; v_code text; v_n integer; v_new_id uuid;
  v_group uuid := gen_random_uuid();
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  v_qty := pg_catalog.round(p_quantity_m, 3);
  if v_qty is null or v_qty <= 0 then
    raise exception 'الكمية يجب أن تكون أكبر من صفر.' using errcode = 'BD400';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  select * into v_src from core.fabric_rolls r
  where r.id = p_source_roll_id and r.retired_at is null;
  if not found then
    raise exception 'الرول غير موجود.' using errcode = 'BD404';
  end if;

  if not private.is_org_member(v_src.organization_id) then
    raise exception 'لست عضوًا في مؤسسة هذا الرول.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_src.organization_id, array['admin','sales']::core.app_role[]) then
    raise exception 'دورك لا يسمح بتحويل البقايا.' using errcode = 'BD403';
  end if;

  v_payload := jsonb_build_object(
    'op', 'create_mini_roll', 'user_id', v_uid,
    'source_roll_id', p_source_roll_id, 'quantity_m', v_qty);

  select * into v_prior from core.client_operations o
  where o.organization_id = v_src.organization_id
    and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- فضاء الرموز واحد للرولات كلها (unique org,code) - قفل receive الاستشاري
  -- نفسه يصفّف توليد الرمز ضد استلامٍ وتحويلٍ متزامنين معًا
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('baytak:receive_fabric_roll:' || v_src.organization_id::text, 0));

  perform 1 from core.fabric_rolls where id = p_source_roll_id for update;

  -- إعادة البحث بعد نيل القفل تصطاد سباق النقر المزدوج
  select * into v_prior from core.client_operations o
  where o.organization_id = v_src.organization_id
    and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  select * into v_bal from private.roll_balance(p_source_roll_id);
  if v_qty > v_bal.available_m then
    raise exception 'الكمية المطلوبة (% م) أكبر من المتاح (% م) في الرول %.',
      v_qty, v_bal.available_m, v_src.code using errcode = 'BD422';
  end if;

  -- الرمز على نمط التطبيق: أصل الرمز + M مرقّمة، والعدّاد يقفز فوق المحجوز
  v_n := (select count(*) from core.fabric_rolls
          where organization_id = v_src.organization_id and is_mini_roll);
  loop
    v_n := v_n + 1;
    v_code := pg_catalog.split_part(v_src.code, '-', 1) || '-M' || lpad(v_n::text, 2, '0');
    exit when not exists (
      select 1 from core.fabric_rolls
      where organization_id = v_src.organization_id and upper(code) = upper(v_code));
  end loop;

  -- البقايا ترث دفعة الصبغ والمكان والخياط: تُخاط مع أصلها بلا فرق يُرى
  insert into core.fabric_rolls
    (organization_id, variant_id, code, dye_lot, location,
     initial_meters, is_mini_roll, assigned_tailor_id)
  values (v_src.organization_id, v_src.variant_id, v_code, v_src.dye_lot, v_src.location,
          v_qty, true, v_src.assigned_tailor_id)
  returning id into v_new_id;

  -- تحويل لا خلق: ما يدخل الميني رول يخرج من أصله - حركتان تحت مجموعة واحدة
  insert into core.stock_movements
    (organization_id, roll_id, type, quantity_m, notes, created_by,
     idempotency_key, operation_group_id)
  values
    (v_src.organization_id, p_source_roll_id, 'transfer_out', v_qty,
     'تحويل بقايا إلى ' || v_code, v_uid, p_idempotency_key, v_group),
    (v_src.organization_id, v_new_id, 'transfer_in', v_qty,
     'بقايا من ' || v_src.code, v_uid, gen_random_uuid(), v_group);

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_src.organization_id, v_uid, 'inventory.mini_roll', 'fabric_roll', v_new_id::text,
          format('إنشاء Mini Roll %s من %s بـ%s م', v_code, v_src.code, v_qty), v_payload);

  select * into v_bal from private.roll_balance(p_source_roll_id);

  v_result := jsonb_build_object(
    'mini_roll_id',       v_new_id,
    'code',               v_code,
    'source_roll_id',     p_source_roll_id,
    'quantity_m',         v_qty,
    'source_available_m', v_bal.available_m,
    'was_replayed',       false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_src.organization_id, v_uid, p_idempotency_key, p_idempotency_key,
          'create_mini_roll', v_new_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

-- ── الملكية والصلاحيات ──────────────────────────────────────────────────────
grant create on schema api to baytak_rpc_owner;

alter function api.create_mini_roll(uuid, numeric, uuid) owner to baytak_rpc_owner;

revoke create on schema api from baytak_rpc_owner;

revoke all on function api.create_mini_roll(uuid, numeric, uuid) from public, anon;

grant execute on function api.create_mini_roll(uuid, numeric, uuid) to authenticated;

notify pgrst, 'reload schema';
