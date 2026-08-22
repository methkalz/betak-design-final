-- ════════════════════════════════════════════════════════════════════
-- زيادة الارتفاع الكبير: التسعير نفسه، والسقف 500 ← 800
--
-- المالك: «عندما يكون المقاس 500 سم وأكثر فيزيد السعر 30% من سعر المنتج
-- + كلفة الخياط + القياس». والسقف الأقصى يرتفع إلى 800 سم.
--
-- ثلاثة معدّلات وحدها تُزاد. القماش والبطانة والمسار والتوصيل والماتور
-- وزيادةُ لون البطانة لا تُمسّ.
--
-- ★ الزيادة على **المعدّلات** لا المجاميع: الإسقاط إلى الشيكل يسبق الضربَ
--   لو زِيد المجموع، فيضيع شيكلٌ من الشبابيك الضيّقة (51سم×500: 298 مقابل 297).
--
-- ★ (x*m + 5000)/10000 قسمةٌ صحيحة بحتة - لا عائم. مع x ≥ 0 و m ≥ 10000
--   هي تقريبٌ إلى الأغورة الأقرب بعيدًا عن الصفر، مرآةُ divRoundHalfAway.
--
-- ★ v_mi (القياس) يعيش خارج حلقة الشبابيك، فيلزم أصلٌ ثابت (v_mi_base)
--   ونسخةٌ لكلّ شبّاك - وإلا تسرّبت الزيادة إلى كلّ شبّاكٍ تالٍ في المشروع.
--
-- التوافق الرجعيّ: المفتاح غائبٌ في اللقطات القديمة فيقرأ صفرًا، والمضاعف
-- 10000 هويّةٌ حسابية - فكلّ نسخةٍ مقفلة تُعيد تسعير نفسها حرفًا بحرف (§10).
--
-- ترتيب العبارتين مقصود: المحرّك **قبل** save_window. العكس يفتح الحفظ
-- بينما يرفض المحرّك، فيسقط المقترح كلّه بـBD422 لا سطرٌ واحد.
--
-- التوقيعان لم يتغيّرا، فالإحلال يبقي المالك والمنح كما هما.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION private.price_project_windows(p_org uuid, p_project uuid, p_ctx jsonb)
 RETURNS TABLE(window_id uuid, room_name text, window_name text, description text, width_cm numeric, height_cm numeric, running_meters numeric, quantity integer, category core.pricing_category, band core.height_band, unit_price_agorot bigint, line_total_agorot bigint, internal_cost_agorot bigint, fabric_meters numeric, lining_meters numeric, sort_order integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  w record;
  v_band core.height_band;
  v_cat core.pricing_category;
  v_price bigint;
  v_tailor bigint;
  v_track bigint;
  v_delivery bigint;
  v_mi bigint;
  v_lining_default bigint;
  v_rm numeric(12,3);
  v_fm numeric(12,3);
  v_lm numeric(12,3);
  v_fab_cost bigint;
  v_lin_cost bigint;
  v_cost_per_rm numeric;
  v_sort integer := 0;
  -- مكوّنات وصلت المحرك بعد المتجهات الذهبية: قيمها صفر في اللقطات القديمة
  -- (coalesce) فتبقى النسخ المقفلة والمتجهات كما هي حرفًا بحرف (§10)
  v_mt_cost bigint;
  v_mt_price bigint;
  v_motor_cost bigint;
  v_motor_price bigint;
  v_remote_cost bigint;
  v_remote_price bigint;
  v_lining_mul numeric(12,3);
  v_surcharge bigint;
  v_unit bigint;
  v_track_sel bigint;
  v_units integer;
  v_pw_price bigint;
  v_pw_cost bigint;
  -- زيادة الارتفاع ≥500: المضاعف بأجزاء المئة (130.00% ← 13000). الاسم ليس
  -- v_surcharge - ذاك زيادةُ لون البطانة.
  v_oversize_mul bigint;
  -- القياس والتركيب صار يعتمد على الارتفاع، فيلزم أصلٌ ثابت ونسخةٌ لكلّ
  -- شبّاك. ★ لولا الفصل لتسرّبت الزيادة إلى كلّ شبّاكٍ تالٍ في المشروع.
  v_mi_base bigint;
begin
  if p_ctx is null or p_ctx->'settings' is null or p_ctx->'rules' is null then
    raise exception 'سياق تسعير ناقص - المحرك يقرأ من اللقطة الملتقطة حصرًا.'
      using errcode = 'BD400';
  end if;

  v_track          := (p_ctx->'settings'->>'track_cost_per_meter_agorot')::bigint;
  v_delivery       := (p_ctx->'settings'->>'delivery_cost_per_meter_agorot')::bigint;
  v_mi_base        := (p_ctx->'settings'->>'measure_install_cost_per_meter_agorot')::bigint;
  v_lining_default := (p_ctx->'settings'->>'lining_cost_per_meter_agorot')::bigint;
  v_mt_cost      := coalesce((p_ctx->'settings'->>'motorized_track_cost_per_meter_agorot')::bigint, 0);
  v_mt_price     := coalesce((p_ctx->'settings'->>'motorized_track_price_per_meter_agorot')::bigint, 0);
  v_motor_cost   := coalesce((p_ctx->'settings'->>'motor_cost_agorot')::bigint, 0);
  v_motor_price  := coalesce((p_ctx->'settings'->>'motor_price_agorot')::bigint, 0);
  v_remote_cost  := coalesce((p_ctx->'settings'->>'remote_cost_agorot')::bigint, 0);
  v_remote_price := coalesce((p_ctx->'settings'->>'remote_price_agorot')::bigint, 0);
  -- المفتاح غائبٌ في اللقطات القديمة فيقرأ صفرًا، والمضاعف 10000 = هويّة
  -- حسابية تُعيد كل نسخةٍ مقفلة تسعيرَ نفسها حرفًا بحرف (§10)
  v_oversize_mul := 10000 + (pg_catalog.round(coalesce(
      (p_ctx->'settings'->>'oversize_surcharge_percent')::numeric, 0) * 100))::bigint;

  for w in
    select win.id, win.name, win.width_cm, win.height_cm, win.quantity,
           win.fullness, win.has_lining, win.notes, win.track,
           win.fabric_variant_id,
           r.name as room_name,
           fv.cost_per_meter_agorot as fabric_cost,
           fp.kind as fabric_kind,
           lv.cost_per_meter_agorot as lining_variant_cost,
           lv.customer_surcharge_per_meter_agorot as lining_surcharge,
           lv.meters_per_running_meter as lining_per_rm
    from core.windows win
    join core.rooms r on r.id = win.room_id
    left join core.fabric_variants fv on fv.id = win.fabric_variant_id
    left join core.fabric_products fp on fp.id = fv.product_id
    left join core.fabric_variants lv on lv.id = win.lining_variant_id
    where win.project_id = p_project and win.organization_id = p_org
    order by r.created_at, win.created_at, win.id
  loop
    v_sort := v_sort + 1;

    if w.height_cm > 800 then
      raise exception 'الشباك "%" ارتفاعه % سم - فوق 800 سم يلزم تسعيرة خاصة من الأدمن، لا تسعير تلقائي.',
        w.name, w.height_cm using errcode = 'BD422';
    end if;
    if w.fabric_variant_id is null or w.fabric_cost is null then
      raise exception 'الشباك "%" بلا قماش محدد - اختر القماش قبل إنشاء العرض.',
        w.name using errcode = 'BD422';
    end if;

    -- يتغيّر السعر عند 320 سم (تصحيح المالك 10.8.2026 - كان 330)
    v_band := case when w.height_cm >= 320 then 'tall' else 'standard' end::core.height_band;
    v_cat  := case
                when w.fabric_kind = 'crepe' and w.has_lining     then 'crepe_with_lining'
                when w.fabric_kind = 'crepe' and not w.has_lining then 'crepe_without_lining'
                when w.has_lining                                 then 'other_with_lining'
                else 'other_without_lining'
              end::core.pricing_category;

    select (r->>'customer_price_per_meter_agorot')::bigint,
           (r->>'tailor_cost_per_meter_agorot')::bigint
      into v_price, v_tailor
    from jsonb_array_elements(p_ctx->'rules') r
    where r->>'band' = v_band::text and r->>'category' = v_cat::text;
    if v_price is null then
      raise exception 'لا قاعدة تسعير للفئة % والارتفاع % - راجع إعدادات التسعير.',
        v_cat, v_band using errcode = 'BD422';
    end if;

    -- ★ زيادة الارتفاع الكبير (قرار المالك 22.8.2026): من 500 سم فأكثر -
    -- شاملًا الـ500 - تُزاد ثلاثة معدّلات: سعر الزبون للمتر، وأجرة الخياط،
    -- والقياس والتركيب. القماش والبطانة والمسار والتوصيل والماتور وزيادةُ
    -- لون البطانة لا تُمسّ.
    --
    -- تُزاد **المعدّلات** لا المجاميع: الإسقاط إلى الشيكل يسبق الضربَ لو
    -- زِيد المجموع، فيضيع شيكلٌ من الشبابيك الضيّقة (51سم×500: 298 مقابل 297).
    --
    -- (x*m + 5000)/10000 قسمةٌ صحيحة تبتر، وهي مع x ≥ 0 و m ≥ 10000 تقريبٌ
    -- إلى الأغورة الأقرب بعيدًا عن الصفر - مرآةُ divRoundHalfAway حرفًا.
    -- ولا يدخلها عائمٌ إطلاقًا: bigint في bigint على bigint.
    if w.height_cm >= 500 then
      v_price  := (v_price   * v_oversize_mul + 5000) / 10000;
      v_tailor := (v_tailor  * v_oversize_mul + 5000) / 10000;
      v_mi     := (v_mi_base * v_oversize_mul + 5000) / 10000;
    else
      -- ★ إلزامي: v_mi يعيش خارج الحلقة، فبلا هذا السطر يحمل شبّاكٌ عاديٌّ
      -- تالٍ زيادةَ الشبّاك العالي الذي سبقه في المشروع نفسه.
      v_mi     := v_mi_base;
    end if;

    v_rm := pg_catalog.round(w.width_cm / 100 * w.quantity, 3);
    v_fm := pg_catalog.round(v_rm * w.fullness, 3);
    -- البطانة تستهلك بنسبتها هي (70% ← 3، 100% ← 1.5)؛ الصفر يعني «اتبع
    -- المضاعف» - وهو السلوك الذي قامت عليه المتجهات الذهبية
    v_lining_mul := case when w.lining_per_rm is not null and w.lining_per_rm > 0
                         then w.lining_per_rm else w.fullness end;
    v_lm := case when w.has_lining then pg_catalog.round(v_rm * v_lining_mul, 3) else 0 end;

    v_fab_cost := w.fabric_cost;
    v_lin_cost := coalesce(w.lining_variant_cost, v_lining_default);
    -- زيادة البطانة المختارة تُضاف إلى سعر المتر الطولي (البطانة 70% داخلة
    -- في السعر فزيادتها صفر، و100% تزيده بما وضعه الأدمن على اللون)
    v_surcharge := case when w.has_lining then coalesce(w.lining_surcharge, 0) else 0 end;

    -- المسار الكهربائي: سعرٌ مستقل للمتر، وماتور وجهاز تحكم لكل ستارة لا
    -- لكل متر - ماتور واحد يكفي ستارة طولها متر أو عشرة. العادي داخل في
    -- سعر القماش: تكلفة على المحل بلا زيادة على الزبون.
    v_units := greatest(1, w.quantity);
    if w.track = 'motorized' then
      v_track_sel := v_mt_cost;
      v_unit      := v_price + v_surcharge + v_mt_price;
      v_pw_price  := (v_motor_price + v_remote_price) * v_units;
      v_pw_cost   := (v_motor_cost + v_remote_cost) * v_units;
    else
      v_track_sel := v_track;
      v_unit      := v_price + v_surcharge;
      v_pw_price  := 0;
      v_pw_cost   := 0;
    end if;

    v_cost_per_rm :=
        v_fab_cost * w.fullness
      + case when w.has_lining then v_lin_cost * v_lining_mul else 0 end
      + v_tailor + v_track_sel + v_delivery + v_mi;

    window_id            := w.id;
    room_name            := w.room_name;
    window_name          := w.name;
    description          := w.notes;
    width_cm             := w.width_cm;
    height_cm            := w.height_cm;
    running_meters       := v_rm;
    quantity             := w.quantity;
    category             := v_cat;
    band                 := v_band;
    unit_price_agorot    := v_unit;
    -- ★ إسقاط الأغوروت: شيكل صحيح لكل بند، ومبالغ الستارة (ماتور وجهاز
    -- تحكم) صحيحة أصلًا فتُضاف بعد الإسقاط - مرآة lineArithmetic حرفًا.
    --
    -- خطوتان لا واحدة: تقريبٌ إلى الأغورة الأقرب ثم بترٌ إلى الشيكل - كما
    -- تفعل حاسبة المالك (tools/price-calculator/app.js) والتطبيق. البتر
    -- المباشر كان يُنقص شيكلًا كلما وقع الحاصل تحت الشيكل بكسر أغورة،
    -- فيرى الزبون رقمًا في المعاينة ويحمل العرض المخزَّن رقمًا أقلّ.
    line_total_agorot    := (pg_catalog.floor(pg_catalog.round(v_unit * v_rm) / 100) * 100)::bigint
                            + v_pw_price;
    internal_cost_agorot := (pg_catalog.floor(pg_catalog.round(v_cost_per_rm * v_rm) / 100) * 100)::bigint
                            + v_pw_cost;
    fabric_meters        := v_fm;
    lining_meters        := v_lm;
    sort_order           := v_sort;
    return next;
  end loop;
end $function$;

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
  if p_height_cm > 800 then
    raise exception 'الارتفاع أكبر من 800 سم - يحتاج تسعيرة خاصة من الأدمن.'
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

COMMENT ON COLUMN core.windows.height_cm IS 'يحدد نطاق التسعير: أقل من 320 = standard، و320 فأكثر = tall. ومن 500 سم فأكثر تُزاد ثلاثة معدّلات بنسبة oversize_surcharge_percent. فوق 800 يحتاج تسعيرة خاصة.';

notify pgrst, 'reload schema';
