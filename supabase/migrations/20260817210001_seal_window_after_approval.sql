-- ════════════════════════════════════════════════════════════════════
-- إغلاق الباب الأخير في السلسلة: لا شباك جديد بعد اعتماد الزبون
--
-- حُرّاس الأمس كانت على فرع **التعديل** وحده. فرع **الإنشاء** بقي بلا
-- حارس حالة البتّة: يُضاف شباك إلى مشروعٍ اعتمده الزبون فلا يُسعَّر أبدًا
-- (create_quotation_version ترفض نسخةً بعد الاعتماد)، ومع ذلك يدخل
-- الإنتاج والتركيب - فيُقصّ ويُخاط ويُركَّب بلا سطرٍ في أي عرض، ويُنقص
-- حساب المشروع ما سُلّم فعلًا.
--
-- الرفض مؤقت بطبعه ومقصود: يرفعه نظام الملاحق حين يُبنى، فيصير للإضافة
-- بابٌ مسعَّرٌ موقَّع بدل بابٍ صامت.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.save_window(p_project_id uuid, p_room_id uuid, p_width_cm numeric, p_height_cm numeric, p_fabric_variant_id uuid, p_idempotency_key uuid, p_window_id uuid DEFAULT NULL::uuid, p_name text DEFAULT ''::text, p_has_lining boolean DEFAULT false, p_lining_variant_id uuid DEFAULT NULL::uuid, p_track text DEFAULT 'ceiling_rail'::text, p_fullness numeric DEFAULT 3, p_quantity integer DEFAULT 1, p_notes text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_window_id uuid; v_status text;
  v_created boolean := false; v_name text; v_track text;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  select p.organization_id, p.status_code into v_org, v_status
  from core.projects p where p.id = p_project_id and p.archived_at is null;
  if v_org is null then
    raise exception 'المشروع غير موجود.' using errcode = 'BD404';
  end if;
  if not private.is_org_member(v_org) then
    raise exception 'لست عضوًا في هذه المؤسسة.' using errcode = 'BD403';
  end if;
  if not private.has_role(v_org, array['admin','sales','field']::core.app_role[]) then
    raise exception 'دورك لا يسمح بتسجيل القياسات.' using errcode = 'BD403';
  end if;
  -- حدود الرؤية نفسها التي كانت على سياسات الكتابة المباشرة: الميداني
  -- يكتب في مشاريعه هو (قائسًا مُسندًا أو صاحبَ زيارة) لا في مشاريع غيره
  if not private.can_see_project(v_org, p_project_id) then
    raise exception 'هذا المشروع خارج نطاق عملك.' using errcode = 'BD403';
  end if;

  if not exists (select 1 from core.rooms r
                 where r.id = p_room_id and r.project_id = p_project_id) then
    raise exception 'الغرفة غير موجودة في هذا المشروع.' using errcode = 'BD404';
  end if;
  if not (p_width_cm > 0 and p_height_cm > 0) then
    raise exception 'العرض والارتفاع يجب أن يكونا أكبر من صفر.' using errcode = 'BD400';
  end if;
  if p_height_cm > 500 then
    raise exception 'الارتفاع أكبر من 500 سم - يحتاج تسعيرة خاصة من الأدمن.'
      using errcode = 'BD400';
  end if;
  if p_fullness < 1.5 or p_fullness > 4 then
    raise exception 'المضاعف يجب أن يكون بين 1.5 و 4.' using errcode = 'BD400';
  end if;
  if p_quantity < 1 or p_quantity > 20 then
    raise exception 'عدد القطع يجب أن يكون بين 1 و20.' using errcode = 'BD400';
  end if;
  if p_track not in ('standard', 'ceiling_rail', 'wall_rod', 'motorized', 'double_rail') then
    raise exception 'نوع مسار غير معروف.' using errcode = 'BD400';
  end if;
  -- مفردة التطبيق «عادي» تُروى إلى قيمة المخطط القديمة - قرار المالك
  -- اختزل المسارات إلى عادي/كهربائي والمخطط سبقه بأربع قيم
  v_track := case when p_track = 'standard' then 'ceiling_rail' else p_track end;
  -- القماش لم يعد اختياريًا: عليه يقوم السعر والحجز التلقائي
  if p_fabric_variant_id is null or not exists (
      select 1 from core.fabric_variants v
      where v.id = p_fabric_variant_id and v.organization_id = v_org
        and v.archived_at is null) then
    raise exception 'اختر القماش - عليه يقوم السعر والحجز التلقائي.' using errcode = 'BD400';
  end if;
  if p_has_lining and (p_lining_variant_id is null or not exists (
      select 1 from core.fabric_variants v
      where v.id = p_lining_variant_id and v.organization_id = v_org
        and v.archived_at is null)) then
    raise exception 'اخترت «مع بطانة» - فحدّد قماش البطانة أو ألغِ الخيار.'
      using errcode = 'BD400';
  end if;

  v_name := coalesce(nullif(pg_catalog.btrim(coalesce(p_name, '')), ''), 'شباك');

  v_payload := jsonb_build_object(
    'op', 'save_window', 'user_id', v_uid,
    'window_id', p_window_id, 'project_id', p_project_id, 'room_id', p_room_id,
    'name', v_name, 'width_cm', p_width_cm, 'height_cm', p_height_cm,
    'has_lining', p_has_lining, 'track', p_track, 'fullness', p_fullness,
    'fabric_variant_id', p_fabric_variant_id, 'lining_variant_id', p_lining_variant_id,
    'quantity', p_quantity, 'notes', coalesce(p_notes, ''));

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.'
        using errcode = 'BD400';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  if p_window_id is null then
    -- الباب الذي كان مفتوحًا: شباكٌ يُضاف بعد اعتماد الزبون لا يمكن أن
    -- يُسعَّر أبدًا (create_quotation_version ترفض نسخةً بعد الاعتماد)،
    -- ومع ذلك كان يدخل الإنتاج والتركيب - فيُقصّ ويُخاط ويُركَّب بلا سطرٍ
    -- في أي عرض، ويُنقص حساب المشروع ما سُلّم فعلًا. يُرفض حتى يصل الملحق
    if exists (
      select 1 from core.quotation_versions v
      join core.quotations q on q.id = v.quotation_id
      where q.project_id = p_project_id and v.status = 'approved')
    then
      raise exception
        'العرض معتمد من الزبون - لا يُضاف شباك إلى مشروعٍ مسعَّرٍ ومتفقٍ عليه. افتح مشروعًا للإضافة.'
        using errcode = 'BD409';
    end if;
    insert into core.windows
      (organization_id, project_id, room_id, name, width_cm, height_cm,
       has_lining, track, fullness, fabric_variant_id, lining_variant_id,
       quantity, notes, measured_at, measured_by)
    values
      (v_org, p_project_id, p_room_id, v_name, p_width_cm, p_height_cm,
       p_has_lining, v_track::core.track_type, p_fullness, p_fabric_variant_id,
       case when p_has_lining then p_lining_variant_id else null end,
       p_quantity, pg_catalog.btrim(coalesce(p_notes, '')), now(), v_uid)
    returning id into v_window_id;
    v_created := true;
  else
    select w.id into v_window_id from core.windows w
    where w.id = p_window_id and w.project_id = p_project_id
    for update;
    if v_window_id is null then
      raise exception 'الشباك غير موجود.' using errcode = 'BD404';
    end if;
    -- ما يُحرّم حذفه يُحرّم تعديل مقاسه: العرض المقفول يسعّر مقاسًا، فلو
    -- تغيّر بعده لسعّرنا ثلاثة أمتار وقصصنا خمسة - والنسخة المعتمدة لا
    -- تُصحَّح لأن create_quotation_version ترفض نسخةً بعد الاعتماد
    if exists (select 1 from core.fabric_usage u where u.window_id = v_window_id) then
      raise exception 'الشباك مسجَّل الإنجاز - لا يُعدَّل مقاسه بعد بدء الإنتاج.'
        using errcode = 'BD409';
    end if;
    if exists (select 1 from core.quotation_items i
               join core.quotation_versions v on v.id = i.version_id
               where i.window_id = v_window_id and v.locked) then
      raise exception 'الشباك ضمن عرض سعرٍ مُرسَل - لا يُغيَّر مقاسه ولا قماشه بعد الإرسال.'
        using errcode = 'BD409';
    end if;
    -- وتغيير القماش بعد الحجز ييتّم الحجز: complete_window تبحث عن حجزٍ
    -- بصنف الشباك الحالي فلا تجده، فيتجمّد أمر الإنتاج بلا مخرج
    if exists (select 1 from core.fabric_reservations r
               join core.fabric_rolls fr on fr.id = r.roll_id
               where r.project_id = p_project_id and r.status <> 'released'
                 and fr.variant_id is distinct from p_fabric_variant_id
                 and exists (select 1 from core.windows w2
                             where w2.id = v_window_id
                               and w2.fabric_variant_id is distinct from p_fabric_variant_id))
    then
      raise exception 'القماش محجوز لهذا المشروع - فُكّ الحجز قبل تغيير الصنف.'
        using errcode = 'BD409';
    end if;
    update core.windows
       set room_id = p_room_id, name = v_name,
           width_cm = p_width_cm, height_cm = p_height_cm,
           has_lining = p_has_lining, track = v_track::core.track_type,
           fullness = p_fullness, fabric_variant_id = p_fabric_variant_id,
           lining_variant_id = case when p_has_lining then p_lining_variant_id else null end,
           quantity = p_quantity, notes = pg_catalog.btrim(coalesce(p_notes, '')),
           measured_at = now(), measured_by = v_uid
     where id = v_window_id;
  end if;

  -- أول قياس يحرّك المشروع «تم القياس» (مرآة التطبيق)
  select p.status_code into v_status
  from core.projects p where p.id = p_project_id for update;
  if v_status in ('new_request', 'awaiting_measurement') then
    perform set_config('app.rpc_context', 'on', true);
    update core.projects set status_code = 'measured' where id = p_project_id;
    perform set_config('app.rpc_context', '', true);
  end if;

  insert into core.audit_logs
    (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'window.save', 'window', v_window_id::text,
          format('حفظ قياس %s', v_name), v_payload);

  v_result := jsonb_build_object(
    'window_id', v_window_id, 'created', v_created, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'save_window', v_window_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end $function$;

notify pgrst, 'reload schema';
