-- ════════════════════════════════════════════════════════════════════
-- أعمدة الخادم التي تنتظرها ميزات التطبيق - تمهيد شريحة الكتابة
--
-- كل عمود هنا يقرؤه التطبيق دفاعيًا من قبلُ (lib/live.ts) بقيمة صفرية،
-- فوصوله يُحيي الميزة بلا تعديل عميل: إسناد الرولات للخياط، ربط الاستهلاك
-- بالشباك، بطانة بدرجتها وزيادتها، المسار الكهربائي وملحقاته، أجرة
-- الزيارة، وفصل عامل القياس عن المركّب. القيم الافتراضية صفرية حتى لا
-- يتغيّر أي حساب قائم.
-- ════════════════════════════════════════════════════════════════════

-- نوع إشعار «إضافة بضاعة» - يسبق 'payment' كترتيب union التطبيق
alter type core.notification_kind add value if not exists 'stock_received' before 'payment';

-- ── الإعدادات: الأجرة والمسار الكهربائي وملحقاته (أسعار وتكاليف) ──────
alter table core.business_settings
  add column if not exists field_visit_wage_agorot                bigint not null default 0,
  add column if not exists motorized_track_cost_per_meter_agorot  bigint not null default 0,
  add column if not exists motorized_track_price_per_meter_agorot bigint not null default 0,
  add column if not exists motor_cost_agorot                      bigint not null default 0,
  add column if not exists motor_price_agorot                     bigint not null default 0,
  add column if not exists remote_cost_agorot                     bigint not null default 0,
  add column if not exists remote_price_agorot                    bigint not null default 0;
alter table core.business_settings
  add constraint business_settings_field_visit_wage_agorot_check check (field_visit_wage_agorot >= 0),
  add constraint business_settings_motor_cost_agorot_check       check (motor_cost_agorot >= 0),
  add constraint business_settings_motor_price_agorot_check      check (motor_price_agorot >= 0),
  add constraint business_settings_motorized_track_cost_check    check (motorized_track_cost_per_meter_agorot >= 0),
  add constraint business_settings_motorized_track_price_check   check (motorized_track_price_per_meter_agorot >= 0),
  add constraint business_settings_remote_cost_agorot_check      check (remote_cost_agorot >= 0),
  add constraint business_settings_remote_price_agorot_check     check (remote_price_agorot >= 0);

-- ── الرول يحمل حائزه: الخياط يضيف بضاعته لنفسه والأدمن يتابع ──────────
alter table core.fabric_rolls add column if not exists assigned_tailor_id uuid;
alter table core.fabric_rolls
  add constraint fabric_rolls_organization_id_assigned_tailor_id_fkey
  foreign key (organization_id, assigned_tailor_id)
  references core.organization_members(organization_id, user_id) on delete restrict;
create index if not exists rolls_assigned_tailor_idx on core.fabric_rolls
  using btree (organization_id, assigned_tailor_id)
  where ((assigned_tailor_id is not null) and (retired_at is null));

-- ── الاستهلاك يعرف شباكه: «مُنجز» يُشتق من سجلاته حصرًا ───────────────
alter table core.fabric_usage add column if not exists window_id uuid;
alter table core.fabric_usage
  add constraint fabric_usage_organization_id_window_id_fkey
  foreign key (organization_id, window_id)
  references core.windows(organization_id, id) on delete set null (window_id);
create index if not exists usage_window_idx on core.fabric_usage
  using btree (organization_id, window_id) where (window_id is not null);

-- ── البطانة: زيادة سعرها ونسبة استهلاكها الخاصة بدرجتها ───────────────
alter table core.fabric_variants
  add column if not exists customer_surcharge_per_meter_agorot bigint not null default 0,
  add column if not exists meters_per_running_meter numeric(6,3) not null default 0;
alter table core.fabric_variants
  add constraint fabric_variants_customer_surcharge_check check (customer_surcharge_per_meter_agorot >= 0),
  add constraint fabric_variants_meters_per_running_meter_check check (meters_per_running_meter >= (0)::numeric);

-- ── القياس والتركيب عاملان قد يفترقان - عمودان، والقديم يُروى منه ─────
alter table core.projects
  add column if not exists measurement_worker_id uuid,
  add column if not exists installer_id uuid;
alter table core.projects
  add constraint projects_organization_id_measurement_worker_id_fkey
  foreign key (organization_id, measurement_worker_id)
  references core.organization_members(organization_id, user_id) on delete set null (measurement_worker_id),
  add constraint projects_organization_id_installer_id_fkey
  foreign key (organization_id, installer_id)
  references core.organization_members(organization_id, user_id) on delete set null (installer_id);
update core.projects set measurement_worker_id = field_worker_id
 where measurement_worker_id is null and field_worker_id is not null;
create index if not exists projects_measurement_worker_idx on core.projects
  using btree (organization_id, measurement_worker_id) where (measurement_worker_id is not null);
create index if not exists projects_installer_idx on core.projects
  using btree (organization_id, installer_id) where (installer_id is not null);

-- ── كشف الأعمدة في views القراءة (الجديد آخر القائمة حصرًا) ────────────
create or replace view api.fabric_rolls
  with (security_invoker = on) as
SELECT r.id AS roll_id,
    r.organization_id,
    r.variant_id,
    v.color_name,
    v.color_hex,
    pr.name AS product_name,
    pr.kind,
    r.code,
    r.dye_lot,
    r.location,
    r.initial_meters,
    r.is_mini_roll,
    r.created_at,
    r.assigned_tailor_id
   FROM core.fabric_rolls r
     JOIN core.fabric_variants v ON v.id = r.variant_id
     JOIN core.fabric_products pr ON pr.id = v.product_id
  WHERE r.retired_at IS NULL;

create or replace view api.fabric_usage
  with (security_invoker = on) as
SELECT u.id AS usage_id,
    u.organization_id,
    u.project_id,
    u.reservation_id,
    u.roll_id,
    u.planned_m,
    u.actual_m,
    u.waste_m,
    round(u.actual_m - u.planned_m, 3) AS variance_m,
    u.actual_m > u.planned_m AS over_plan,
    u.reason_code,
    mr.label_ar AS reason_label,
    u.notes,
    u.created_by,
    u.created_at,
    u.window_id
   FROM core.fabric_usage u
     LEFT JOIN core.movement_reasons mr ON mr.code = u.reason_code;

create or replace view api.fabric_variants
  with (security_invoker = on) as
SELECT v.id AS variant_id,
    v.organization_id,
    v.product_id,
    pr.name AS product_name,
    pr.kind,
    v.color_name,
    v.color_hex,
    v.sku,
    v.image_url,
    v.customer_surcharge_per_meter_agorot,
    v.meters_per_running_meter
   FROM core.fabric_variants v
     JOIN core.fabric_products pr ON pr.id = v.product_id
  WHERE v.archived_at IS NULL;

create or replace view api.projects
  with (security_invoker = on) as
SELECT projects.id AS project_id,
    projects.organization_id,
    projects.customer_id,
    projects.code,
    projects.title,
    projects.status_code,
    projects.priority,
    projects.field_worker_id,
    projects.tailor_id,
    projects.measurement_date,
    projects.installation_date,
    projects.notes,
    projects.created_at,
    projects.updated_at,
    projects.archived_at,
    projects.lock_version,
    projects.measurement_worker_id,
    projects.installer_id
   FROM core.projects;

create or replace view api.business_settings
  with (security_invoker = on) as
SELECT business_settings.organization_id,
    business_settings.min_margin_percent,
    business_settings.employee_discount_limit_percent,
    business_settings.admin_discount_limit_percent,
    business_settings.quotation_validity_days,
    business_settings.vat_percent,
    business_settings.currency,
    business_settings.motorized_track_price_per_meter_agorot,
    business_settings.motor_price_agorot,
    business_settings.remote_price_agorot
   FROM core.business_settings;

create or replace view api.business_settings_costs
  with (security_invoker = on) as
SELECT business_settings.organization_id,
    business_settings.track_cost_per_meter_agorot,
    business_settings.delivery_cost_per_meter_agorot,
    business_settings.measure_install_cost_per_meter_agorot,
    business_settings.lining_cost_per_meter_agorot,
    business_settings.motorized_track_cost_per_meter_agorot,
    business_settings.motor_cost_agorot,
    business_settings.remote_cost_agorot,
    business_settings.field_visit_wage_agorot
   FROM core.business_settings
  WHERE private.has_role(business_settings.organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]);

-- ── توثيق الأعمدة ──────────────────────────────────────────────────────
COMMENT ON COLUMN core.business_settings.field_visit_wage_agorot IS 'أجرة الزيارة الميدانية الواحدة (قياس أو تركيب) - تغذي دفتر الطاقم.';
COMMENT ON COLUMN core.business_settings.motorized_track_price_per_meter_agorot IS 'سعر المتر للمسار الكهربائي على الزبون. العادي داخل في سعر القماش بلا زيادة.';
COMMENT ON COLUMN core.fabric_rolls.assigned_tailor_id IS 'الخياط الحائز للرول: يضيفه لنفسه (receive_own_fabric) أو تسنده الإدارة. NULL = مخزن المعرض.';
COMMENT ON COLUMN core.fabric_usage.window_id IS 'الشباك الذي استُهلك له - «الشباك مُنجز» يُشتق من وجود سجلات استهلاكه حصرًا. يبقى القيد لو حُذف الشباك (SET NULL).';
COMMENT ON COLUMN core.fabric_variants.customer_surcharge_per_meter_agorot IS 'زيادة على سعر المتر الطولي للزبون حين تُختار بطانةً (100% مثلًا). السالب ممنوع.';
COMMENT ON COLUMN core.fabric_variants.meters_per_running_meter IS 'استهلاك البطانة لكل متر طولي (70% ← 3، 100% ← 1.5). صفر = اتبع مضاعف الشباك.';
COMMENT ON COLUMN core.projects.measurement_worker_id IS 'عامل القياس - انفصل عن field_worker_id القديم الذي بقي للتوافق.';
COMMENT ON COLUMN core.projects.installer_id IS 'المركّب - قد يكون غير عامل القياس، وإشعار «جاهز للتركيب» يستهدفه أولًا.';
