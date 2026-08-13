-- ════════════════════════════════════════════════════════════════════
-- التسويات والاستلام الإضافي على الخادم
--
-- ما بقي من حركات الرول اليدوية بلا RPC: الاستلام الإضافي وتسويتا
-- الجرد. الزيادة روتين للأدمن والمبيعات، والنقصان كسياسة التلف العام -
-- الأدمن وحده وبسبب مسجَّل وسقف المتاح غير المحجوز. الإرجاع اليدوي
-- ليس هنا عمدًا وإلى الأبد: لكل إرجاعٍ سجلُّ استخدامٍ يقيّده (الربط
-- الخماسي) ودربه return_consumed_fabric من إتمام الشباك.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.adjust_stock(p_roll_id uuid, p_type text, p_quantity_m numeric, p_idempotency_key uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_qty numeric(12,3); v_notes text;
  v_src core.fabric_rolls%rowtype;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
  v_bal record; v_mv_id uuid;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  -- الإرجاع ليس هنا عمدًا: لكل إرجاعٍ سجلُّ استخدامٍ يقيّده (الربط الخماسي)
  -- ودربه return_consumed_fabric. والتلف له مساراه الموثّقان.
  if p_type not in ('receipt', 'adjustment_in', 'adjustment_out') then
    raise exception 'نوع الحركة غير معتمد من هذا المسار.' using errcode = 'BD400';
  end if;
  v_qty := pg_catalog.round(p_quantity_m, 3);
  if v_qty is null or v_qty <= 0 then
    raise exception 'الكمية يجب أن تكون أكبر من صفر.' using errcode = 'BD400';
  end if;
  -- سقف الشحنة الحقيقية كمسار الاستلام: خطأ مطبعي واحد كان يخلق آلاف
  -- الأمتار الوهمية ثم يحجز عليها المشاريع
  if p_type in ('receipt', 'adjustment_in') and v_qty > 10000 then
    raise exception 'الكمية أكبر من أي شحنةٍ حقيقية - راجع الرقم.' using errcode = 'BD400';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;
  v_notes := pg_catalog.btrim(coalesce(p_notes, ''));
  if p_type = 'adjustment_out' and v_notes = '' then
    raise exception 'التسوية بالنقصان تحتاج سببًا مسجَّلًا.' using errcode = 'BD400';
  end if;

  select * into v_src from core.fabric_rolls r
  where r.id = p_roll_id and r.retired_at is null;
  if not found then
    raise exception 'الرول غير موجود.' using errcode = 'BD404';
  end if;

  if not private.is_org_member(v_src.organization_id) then
    raise exception 'لست عضوًا في مؤسسة هذا الرول.' using errcode = 'BD403';
  end if;
  -- الزيادة روتين يومي للأدمن والمبيعات؛ النقصان يمحو أثرًا ماليًا -
  -- كسياسة التلف العام: الأدمن وحده
  if p_type = 'adjustment_out' then
    if not private.has_role(v_src.organization_id, array['admin']::core.app_role[]) then
      raise exception 'تسوية النقصان صلاحية الأدمن وحده.' using errcode = 'BD403';
    end if;
  else
    if not private.has_role(v_src.organization_id, array['admin','sales']::core.app_role[]) then
      raise exception 'دورك لا يسمح بتسجيل حركات المخزون.' using errcode = 'BD403';
    end if;
    -- عقيدة الاستلام (قرار المالك 11.8): رصيد الخياط المسنَد لا يزيده إلا
    -- الأدمن أو الخياط نفسه من مساره - لا باب جانبيًا للمبيعات هنا
    if v_src.assigned_tailor_id is not null
       and not private.has_role(v_src.organization_id, array['admin']::core.app_role[]) then
      raise exception 'رصيد خياطٍ مسنَد: يزيده الأدمن أو الخياط نفسه من مسار الاستلام.'
        using errcode = 'BD403';
    end if;
  end if;

  v_payload := jsonb_build_object(
    'op', 'adjust_stock', 'user_id', v_uid, 'roll_id', p_roll_id,
    'type', p_type, 'quantity_m', v_qty, 'notes', v_notes);

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

  perform 1 from core.fabric_rolls where id = p_roll_id for update;

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

  if p_type = 'adjustment_out' then
    select * into v_bal from private.roll_balance(p_roll_id);
    if v_qty > v_bal.available_m then
      raise exception 'التسوية أكبر من المتاح غير المحجوز (% م) في الرول %.',
        v_bal.available_m, v_src.code using errcode = 'BD422';
    end if;
  end if;

  -- التسويتان تحملان رمز سبب معتمد (قيد الجدول) والتفصيل في الملاحظات
  insert into core.stock_movements
    (organization_id, roll_id, type, quantity_m, reason_code, notes,
     created_by, idempotency_key)
  values (v_src.organization_id, p_roll_id, p_type::core.movement_type, v_qty,
          case when p_type in ('adjustment_in', 'adjustment_out') then 'other' end,
          v_notes, v_uid, p_idempotency_key)
  returning id into v_mv_id;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_src.organization_id, v_uid, 'inventory.movement', 'stock_movement', v_mv_id::text,
          format('%s %s م على %s', p_type, v_qty, v_src.code), v_payload);

  select * into v_bal from private.roll_balance(p_roll_id);

  v_result := jsonb_build_object(
    'movement_id',         v_mv_id,
    'roll_id',             p_roll_id,
    'roll_code',           v_src.code,
    'type',                p_type,
    'quantity_m',          v_qty,
    'on_hand_quantity_m',  v_bal.on_hand_m,
    'available_quantity_m', v_bal.available_m,
    'was_replayed',        false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_src.organization_id, v_uid, p_idempotency_key, p_idempotency_key,
          'adjust_stock', v_mv_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

-- ── الملكية والصلاحيات ──────────────────────────────────────────────────────
grant create on schema api to baytak_rpc_owner;

alter function api.adjust_stock(uuid, text, numeric, uuid, text) owner to baytak_rpc_owner;

revoke create on schema api from baytak_rpc_owner;

revoke all on function api.adjust_stock(uuid, text, numeric, uuid, text) from public, anon;

grant execute on function api.adjust_stock(uuid, text, numeric, uuid, text) to authenticated;

notify pgrst, 'reload schema';
