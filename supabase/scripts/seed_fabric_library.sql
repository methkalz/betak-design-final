-- ════════════════════════════════════════════════════════════════════
-- زرع مكتبة الأقمشة الحقيقية (قرار المالك 6.8.2026 - من البذرة القانونية)
--
-- ثلاثة أنواع: كريب جورجيت (crepe، عرض 300)، بشتان (other، عرض 300)،
-- بطانة (درجتا تغطية لا ألوان: 70% داخلة في السعر وتستهلك ×3،
-- و100% بزيادة 170₪ للمتر الطولي وتستهلك ×1.5).
--
-- آمن للإعادة: الأنواع تُدرَج إن غابت (بالاسم)، والألوان upsert بالرمز
-- المخزني، ومكتبة حقبة الاختبارات تُؤرشف - دفاترها ورولاتها تبقى كما
-- تقضي قاعدة «لا حذف في الدفاتر».
--
--   docker exec -i <supabase-db> psql -U postgres -v ON_ERROR_STOP=1 \
--     < supabase/scripts/seed_fabric_library.sql
-- ════════════════════════════════════════════════════════════════════

begin;

with org as (select organization_id as id from core.business_settings limit 1),
     prods(name, kind, width_cm) as (values
  ('كريب جورجيت', 'crepe',  300),
  ('بشتان',       'other',  300),
  ('بطانة',       'lining', 280))
insert into core.fabric_products (organization_id, name, kind, width_cm)
select org.id, p.name, p.kind::core.fabric_kind, p.width_cm
from prods p, org
where not exists (
  select 1 from core.fabric_products fp
  where fp.organization_id = org.id and fp.name = p.name);

with org as (select organization_id as id from core.business_settings limit 1),
     vars(product_name, color_name, color_hex, sku, cost, surcharge, mrm) as (values
  ('كريب جورجيت', 'أوف وايت',   '#F2EDE4', 'CRG-OFFWHITE', 1400,     0, 0),
  ('كريب جورجيت', 'أبيض',       '#FFFFFF', 'CRG-WHITE',    1400,     0, 0),
  ('بشتان',       'أوف وايت',   '#F2EDE4', 'BSH-OFFWHITE', 2000,     0, 0),
  ('بشتان',       'أبيض',       '#FFFFFF', 'BSH-WHITE',    2000,     0, 0),
  ('بشتان',       'بيج',        '#D8C3A5', 'BSH-BEIGE',    2000,     0, 0),
  ('بطانة',       'تغطية 70%',  '#E8E4DC', 'LN-70',         900,     0, 3),
  ('بطانة',       'تغطية 100%', '#C9C4BA', 'LN-100',       3000, 17000, 1.5))
insert into core.fabric_variants
  (organization_id, product_id, color_name, color_hex, sku,
   cost_per_meter_agorot, customer_surcharge_per_meter_agorot, meters_per_running_meter)
select org.id, fp.id, v.color_name, v.color_hex, v.sku,
       v.cost, v.surcharge, v.mrm
from vars v
join org on true
join core.fabric_products fp
  on fp.organization_id = org.id and fp.name = v.product_name
on conflict (organization_id, sku) do update
  set color_name                          = excluded.color_name,
      color_hex                           = excluded.color_hex,
      cost_per_meter_agorot               = excluded.cost_per_meter_agorot,
      customer_surcharge_per_meter_agorot = excluded.customer_surcharge_per_meter_agorot,
      meters_per_running_meter            = excluded.meters_per_running_meter,
      archived_at                         = null;

-- مكتبة حقبة الاختبارات تُؤرشف: تخرج من القوائم ودفاترها باقية
update core.fabric_variants
   set archived_at = coalesce(archived_at, now())
 where sku in ('CR-BEIGE', 'LN-WHITE', 'VL-ROYAL');

update core.fabric_products
   set archived_at = coalesce(archived_at, now())
 where name in ('كريب فاخر', 'مخمل ثقيل', 'بطانة قياسية');

commit;

-- ── تحقّق بصري ─────────────────────────────────────────────────────────
select p.name, p.kind, v.sku, v.color_name, v.cost_per_meter_agorot as cost,
       v.customer_surcharge_per_meter_agorot as surcharge,
       v.meters_per_running_meter as mrm
from core.fabric_variants v
join core.fabric_products p on p.id = v.product_id
where v.archived_at is null
order by p.name, v.sku;
