-- ════════════════════════════════════════════════════════════════════
-- مواءمة أسعار الخادم بأرقام المالك المعتمدة في التطبيق (data/seed.ts)
--
-- يُشغَّل مرة واحدة على خادم الإنتاج بعد ترحيلات 12-13.8.2026:
--   docker exec -i <supabase-db> psql -U postgres -v ON_ERROR_STOP=1 \
--     < supabase/scripts/apply_owner_prices.sql
--
-- آمن للإعادة: تحديثات مطلقة القيم لا تراكمية. عالم معرضٍ واحد -
-- التحديث يطال صف الإعدادات الوحيد وقواعده الثماني.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── إعدادات المعرض: الأساس + المكوّنات الجديدة ─────────────────────────
update core.business_settings set
  track_cost_per_meter_agorot            = 1000,
  delivery_cost_per_meter_agorot         = 1000,
  measure_install_cost_per_meter_agorot  = 1500,
  lining_cost_per_meter_agorot           = 900,
  field_visit_wage_agorot                = 15000,
  motorized_track_cost_per_meter_agorot  = 10000,
  motorized_track_price_per_meter_agorot = 20000,
  motor_cost_agorot                      = 40000,
  motor_price_agorot                     = 90000,
  remote_cost_agorot                     = 10000,
  remote_price_agorot                    = 20000;

-- ── قواعد التسعير الثماني (لوحة المالك) ────────────────────────────────
-- تُدرَج إن غابت وتُحدَّث إن وُجدت - على معرض صف الإعدادات نفسه
with org as (select organization_id from core.business_settings limit 1),
     rules(band, category, price, tailor) as (values
  ('standard', 'crepe_with_lining',    29000, 4000),
  ('standard', 'crepe_without_lining', 27000, 4000),
  ('standard', 'other_without_lining', 29000, 4000),
  ('standard', 'other_with_lining',    35000, 4000),
  ('tall',     'crepe_with_lining',    45000, 7000),
  ('tall',     'crepe_without_lining', 43000, 7000),
  ('tall',     'other_without_lining', 45000, 7000),
  ('tall',     'other_with_lining',    51000, 7000))
insert into core.pricing_rules
  (organization_id, band, category,
   customer_price_per_meter_agorot, tailor_cost_per_meter_agorot)
select org.organization_id, r.band::core.height_band, r.category::core.pricing_category,
       r.price, r.tailor
from rules r, org
on conflict (organization_id, band, category) do update
  set customer_price_per_meter_agorot = excluded.customer_price_per_meter_agorot,
      tailor_cost_per_meter_agorot    = excluded.tailor_cost_per_meter_agorot;

-- ── درجتا البطانة (بالرمز المخزني): التكلفة والزيادة ونسبة الاستهلاك ────
-- 70%: داخلة في السعر، تستهلك ×3. 100%: زيادة 170₪ للمتر الطولي، تستهلك ×1.5
update core.fabric_variants set
  cost_per_meter_agorot               = 900,
  customer_surcharge_per_meter_agorot = 0,
  meters_per_running_meter            = 3
where upper(sku) = 'LN-70';

update core.fabric_variants set
  cost_per_meter_agorot               = 3000,
  customer_surcharge_per_meter_agorot = 17000,
  meters_per_running_meter            = 1.5
where upper(sku) = 'LN-100';

commit;

-- ── تحقّق بصري بعد التشغيل ─────────────────────────────────────────────
select 'settings' as what, motorized_track_price_per_meter_agorot,
       motor_price_agorot, remote_price_agorot, field_visit_wage_agorot
from core.business_settings;
select 'rules' as what, band, category, customer_price_per_meter_agorot
from core.pricing_rules order by band, category;
select 'linings' as what, sku, cost_per_meter_agorot,
       customer_surcharge_per_meter_agorot, meters_per_running_meter
from core.fabric_variants where upper(sku) in ('LN-70', 'LN-100');
-- إن أظهر سطرا البطانة صفر صفوف: مكتبة الأقمشة غير مزروعة على الخادم بعد
-- (بانتظار قائمتك الحقيقية) - عندها تُدخل الدرجتان مع المكتبة.
