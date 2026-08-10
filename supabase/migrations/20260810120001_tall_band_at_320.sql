-- ============================================================================
-- حدُّ شريحة الارتفاع عند 320 سم (تصحيح المالك 10.8.2026 - كان 330)
--
-- «يتغير السعر ليس عند ارتفاع 329 سم - بل عند 320 سم». الشباك بارتفاع 320
-- فأكثر يأخذ تسعيرة الشريحة العالية، وما دونه العادية. حدّ الـ500 كما هو:
-- فوقه لا تسعير تلقائي (BD422).
--
-- الموضعان اللذان يحسبان الشريحة يتغيّران معًا: محرك التسعير الخاص، وعرض
-- تفاصيل الشبابيك. والنسخ المرسلة لا تُمَسّ - المحتوى مجمّد بقرار §10 و،
-- فما وُقّع على شريحة 330 يبقى كما صدر.
--
-- المرآة في TS (`expo/domain/pricing.ts`: TALL_BAND_MIN_CM = 320) تغيّرت
-- في الالتزام نفسه، ومعها اختبار التطابق على جانبَي الحدّ (319/320).
-- ============================================================================

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
begin
  if p_ctx is null or p_ctx->'settings' is null or p_ctx->'rules' is null then
    raise exception 'سياق تسعير ناقص - المحرك يقرأ من اللقطة الملتقطة حصرًا.'
      using errcode = 'BD400';
  end if;

  v_track          := (p_ctx->'settings'->>'track_cost_per_meter_agorot')::bigint;
  v_delivery       := (p_ctx->'settings'->>'delivery_cost_per_meter_agorot')::bigint;
  v_mi             := (p_ctx->'settings'->>'measure_install_cost_per_meter_agorot')::bigint;
  v_lining_default := (p_ctx->'settings'->>'lining_cost_per_meter_agorot')::bigint;

  for w in
    select win.id, win.name, win.width_cm, win.height_cm, win.quantity,
           win.fullness, win.has_lining, win.notes,
           win.fabric_variant_id,
           r.name as room_name,
           fv.cost_per_meter_agorot as fabric_cost,
           fp.kind as fabric_kind,
           lv.cost_per_meter_agorot as lining_variant_cost
    from core.windows win
    join core.rooms r on r.id = win.room_id
    left join core.fabric_variants fv on fv.id = win.fabric_variant_id
    left join core.fabric_products fp on fp.id = fv.product_id
    left join core.fabric_variants lv on lv.id = win.lining_variant_id
    where win.project_id = p_project and win.organization_id = p_org
    order by r.created_at, win.created_at, win.id
  loop
    v_sort := v_sort + 1;

    if w.height_cm > 500 then
      raise exception 'الشباك "%" ارتفاعه % سم - فوق 500 سم يلزم تسعيرة خاصة من الأدمن، لا تسعير تلقائي.',
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

    v_rm := pg_catalog.round(w.width_cm / 100 * w.quantity, 3);
    v_fm := pg_catalog.round(v_rm * w.fullness, 3);
    v_lm := case when w.has_lining then v_fm else 0 end;

    v_fab_cost := w.fabric_cost;
    v_lin_cost := coalesce(w.lining_variant_cost, v_lining_default);

    v_cost_per_rm :=
        v_fab_cost * w.fullness
      + case when w.has_lining then v_lin_cost * w.fullness else 0 end
      + v_tailor + v_track + v_delivery + v_mi;

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
    unit_price_agorot    := v_price;
    -- ★ إسقاط الأغوروت: شيكل صحيح لكل بند (القاعدة الجديدة)
    line_total_agorot    := (pg_catalog.floor(v_price * v_rm / 100) * 100)::bigint;
    internal_cost_agorot := (pg_catalog.floor(v_cost_per_rm * v_rm / 100) * 100)::bigint;
    fabric_meters        := v_fm;
    lining_meters        := v_lm;
    sort_order           := v_sort;
    return next;
  end loop;
end $function$;

create or replace view api.window_details
  with (security_invoker = on) as
SELECT w.id AS window_id,
    w.organization_id,
    w.project_id,
    w.room_id,
    r.name AS room_name,
    w.name,
    w.width_cm,
    w.height_cm,
    w.model,
    w.has_lining,
    w.track,
    w.fullness,
    w.quantity,
    w.fabric_variant_id,
    fv.color_name AS fabric_color,
    fp.name AS fabric_product,
    w.lining_variant_id,
    w.notes,
    w.measured_at,
    w.measured_by,
        CASE
            WHEN w.height_cm >= 320::numeric THEN 'tall'::text
            ELSE 'standard'::text
        END::core.height_band AS band,
    round(w.width_cm / 100.0 * w.quantity::numeric, 3) AS running_meters,
    round(w.width_cm / 100.0 * w.quantity::numeric * w.fullness, 3) AS fabric_meters
   FROM core.windows w
     JOIN core.rooms r ON r.id = w.room_id
     LEFT JOIN core.fabric_variants fv ON fv.id = w.fabric_variant_id
     LEFT JOIN core.fabric_products fp ON fp.id = fv.product_id;

COMMENT ON COLUMN core.windows.height_cm IS 'يحدد نطاق التسعير: أقل من 320 = standard، و320 فأكثر = tall (تصحيح المالك 10.8.2026). فوق 500 يحتاج تسعيرة خاصة.';
