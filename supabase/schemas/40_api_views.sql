-- ════════════════════════════════════════════════════════════════════
-- الviews (39) — كلها security_invoker، بترتيب الاعتماد لا الأبجدية
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

create or replace view api.attachments
  with (security_invoker = on) as
SELECT attachments.id AS attachment_id,
    attachments.organization_id,
    attachments.project_id,
    attachments.room_id,
    attachments.window_id,
    attachments.visit_id,
    attachments.kind,
    attachments.storage_path,
    attachments.caption,
    attachments.byte_size,
    attachments.created_by,
    attachments.created_at
   FROM core.attachments;

create or replace view api.audit_logs
  with (security_invoker = on) as
SELECT a.id AS log_id,
    a.organization_id,
    a.actor_id,
    p.full_name AS actor_name,
    a.action,
    a.entity,
    a.entity_id,
    a.summary,
    a.created_at
   FROM core.audit_logs a
     LEFT JOIN core.profiles p ON p.id = a.actor_id;

create or replace view api.business_settings
  with (security_invoker = on) as
SELECT business_settings.organization_id,
    business_settings.min_margin_percent,
    business_settings.employee_discount_limit_percent,
    business_settings.admin_discount_limit_percent,
    business_settings.quotation_validity_days,
    business_settings.vat_percent,
    business_settings.currency
   FROM core.business_settings;

create or replace view api.business_settings_costs
  with (security_invoker = on) as
SELECT business_settings.organization_id,
    business_settings.track_cost_per_meter_agorot,
    business_settings.delivery_cost_per_meter_agorot,
    business_settings.measure_install_cost_per_meter_agorot,
    business_settings.lining_cost_per_meter_agorot
   FROM core.business_settings
  WHERE private.has_role(business_settings.organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]);

create or replace view api.client_operations
  with (security_invoker = on) as
SELECT client_operations.id AS operation_id,
    client_operations.organization_id,
    client_operations.user_id,
    client_operations.client_operation_id,
    client_operations.idempotency_key,
    client_operations.kind,
    client_operations.entity_id,
    client_operations.state,
    client_operations.attempts,
    client_operations.error,
    client_operations.created_at,
    client_operations.synced_at
   FROM core.client_operations;

create or replace view api.customer_balance_summary
  with (security_invoker = on) as
SELECT c.id AS customer_id,
    c.organization_id,
    c.full_name,
    count(DISTINCT p.id) AS project_count,
    COALESCE(sum(pay.amount_agorot), 0::numeric) AS paid_agorot
   FROM core.customers c
     LEFT JOIN core.projects p ON p.customer_id = c.id
     LEFT JOIN core.payments pay ON pay.project_id = p.id
  GROUP BY c.id, c.organization_id, c.full_name;

create or replace view api.customers
  with (security_invoker = on) as
SELECT c.id AS customer_id,
    c.organization_id,
    c.full_name,
    c.phone,
    c.city,
    c.address,
    c.notes,
    c.preferences,
    c.created_at,
    c.archived_at,
    c.archived_at IS NOT NULL AS is_archived
   FROM core.customers c;

create or replace view api.discount_requests
  with (security_invoker = on) as
SELECT d.id AS request_id,
    d.organization_id,
    d.quotation_id,
    d.version_id,
    d.requested_percent,
    d.reason,
    d.status,
    d.requested_by,
    rp.full_name AS requested_by_name,
    d.decided_by,
    dp.full_name AS decided_by_name,
    d.decided_at,
    d.decision_note,
    d.created_at
   FROM core.discount_requests d
     LEFT JOIN core.profiles rp ON rp.id = d.requested_by
     LEFT JOIN core.profiles dp ON dp.id = d.decided_by;

create or replace view api.fabric_products
  with (security_invoker = on) as
SELECT fabric_products.id AS product_id,
    fabric_products.organization_id,
    fabric_products.name,
    fabric_products.kind,
    fabric_products.supplier,
    fabric_products.width_cm,
    fabric_products.composition,
    fabric_products.image_url
   FROM core.fabric_products
  WHERE fabric_products.archived_at IS NULL;

create or replace view api.fabric_reservations
  with (security_invoker = on) as
SELECT res.id AS reservation_id,
    res.organization_id,
    res.project_id,
    res.roll_id,
    r.code AS roll_code,
    v.color_name,
    res.quantity_m,
    res.consumed_m,
    res.released_m,
    round(res.quantity_m - res.consumed_m - res.released_m - res.damaged_reserved_m, 3) AS outstanding_m,
    res.status,
    res.created_by,
    res.created_at,
    res.released_at,
    res.damaged_reserved_m,
    res.finalized_at
   FROM core.fabric_reservations res
     JOIN core.fabric_rolls r ON r.id = res.roll_id
     JOIN core.fabric_variants v ON v.id = r.variant_id;

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
    r.created_at
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
    u.created_at
   FROM core.fabric_usage u
     LEFT JOIN core.movement_reasons mr ON mr.code = u.reason_code;

create or replace view api.fabric_variant_costs
  with (security_invoker = on) as
SELECT t.variant_id,
    t.organization_id,
    t.cost_per_meter_agorot
   FROM ( SELECT v.id AS variant_id,
            v.organization_id,
            v.cost_per_meter_agorot
           FROM core.fabric_variants v
          WHERE v.archived_at IS NULL) t
  WHERE private.has_role(t.organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]);

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
    v.image_url
   FROM core.fabric_variants v
     JOIN core.fabric_products pr ON pr.id = v.product_id
  WHERE v.archived_at IS NULL;

create or replace view api.field_visit_details
  with (security_invoker = on) as
SELECT v.id AS visit_id,
    v.organization_id,
    v.project_id,
    pr.code AS project_code,
    pr.title AS project_title,
    c.full_name AS customer_name,
    c.phone AS customer_phone,
    c.address AS customer_address,
    c.city AS customer_city,
    v.assignee_id,
    a.full_name AS assignee_name,
    v.type,
    v.status,
    v.scheduled_at,
    v.started_at,
    v.completed_at,
    v.notes,
    v.check_track,
    v.check_curtain,
    v.check_height,
    v.check_cleanliness,
    v.customer_signed_off
   FROM core.field_visits v
     JOIN core.projects pr ON pr.id = v.project_id
     LEFT JOIN core.customers c ON c.id = pr.customer_id
     LEFT JOIN core.profiles a ON a.id = v.assignee_id;

create or replace view api.field_visits
  with (security_invoker = on) as
SELECT field_visits.id AS visit_id,
    field_visits.organization_id,
    field_visits.project_id,
    field_visits.assignee_id,
    field_visits.type,
    field_visits.status,
    field_visits.scheduled_at,
    field_visits.started_at,
    field_visits.completed_at,
    field_visits.notes,
    field_visits.check_track,
    field_visits.check_curtain,
    field_visits.check_height,
    field_visits.check_cleanliness,
    field_visits.customer_signed_off,
    field_visits.created_at
   FROM core.field_visits;

create or replace view api.me
  with (security_invoker = on) as
SELECT p.id AS user_id,
    om.organization_id,
    p.full_name,
    p.phone,
    p.title,
    p.avatar_url,
    om.role,
    om.is_active
   FROM core.profiles p
     JOIN core.organization_members om ON om.user_id = p.id
  WHERE p.id = (( SELECT auth.uid() AS uid)) AND om.is_active;

create or replace view api.notifications
  with (security_invoker = on) as
SELECT notifications.id AS notification_id,
    notifications.organization_id,
    notifications.user_id,
    notifications.kind,
    notifications.title,
    notifications.body,
    notifications.deep_link,
    notifications.read_at,
    notifications.read_at IS NULL AS is_unread,
    notifications.created_at
   FROM core.notifications;

create or replace view api.organization
  with (security_invoker = on) as
SELECT o.id AS organization_id,
    o.name,
    o.phone,
    o.address
   FROM core.organizations o
  WHERE o.archived_at IS NULL;

create or replace view api.payments
  with (security_invoker = on) as
SELECT pay.id AS payment_id,
    pay.organization_id,
    pay.project_id,
    pay.amount_agorot,
    pay.kind,
    pay.method,
    pay.reference,
    pay.note,
    pay.reversed_payment_id,
    pay.created_by,
    p.full_name AS created_by_name,
    pay.created_at
   FROM core.payments pay
     LEFT JOIN core.profiles p ON p.id = pay.created_by;

create or replace view api.pricing_rules
  with (security_invoker = on) as
SELECT pricing_rules.id AS rule_id,
    pricing_rules.organization_id,
    pricing_rules.band,
    pricing_rules.category,
    pricing_rules.customer_price_per_meter_agorot,
    pricing_rules.tailor_cost_per_meter_agorot,
    pricing_rules.updated_at
   FROM core.pricing_rules;

create or replace view api.project_balances
  with (security_invoker = on) as
SELECT pay.organization_id,
    pay.project_id,
    COALESCE(sum(pay.amount_agorot), 0::numeric) AS paid_agorot
   FROM core.payments pay
  GROUP BY pay.organization_id, pay.project_id;

create or replace view api.project_details
  with (security_invoker = on) as
SELECT p.id AS project_id,
    p.organization_id,
    p.customer_id,
    c.full_name AS customer_name,
    c.phone AS customer_phone,
    c.city AS customer_city,
    c.address AS customer_address,
    p.code,
    p.title,
    p.status_code,
    s.label_ar AS status_label,
    s.sort_order AS status_order,
    s.is_terminal,
    p.priority,
    p.field_worker_id,
    fw.full_name AS field_worker_name,
    p.tailor_id,
    tl.full_name AS tailor_name,
    p.measurement_date,
    p.installation_date,
    p.notes,
    p.created_at,
    p.updated_at,
    p.lock_version,
    ( SELECT count(*) AS count
           FROM core.rooms r
          WHERE r.project_id = p.id) AS room_count,
    ( SELECT count(*) AS count
           FROM core.windows w
          WHERE w.project_id = p.id) AS window_count
   FROM core.projects p
     LEFT JOIN core.customers c ON c.id = p.customer_id
     JOIN core.project_statuses s ON s.status_code = p.status_code
     LEFT JOIN core.profiles fw ON fw.id = p.field_worker_id
     LEFT JOIN core.profiles tl ON tl.id = p.tailor_id
  WHERE p.archived_at IS NULL;

create or replace view api.project_statuses
  with (security_invoker = on) as
SELECT project_statuses.status_code,
    project_statuses.label_ar,
    project_statuses.sort_order,
    project_statuses.is_terminal
   FROM core.project_statuses;

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
    projects.lock_version
   FROM core.projects;

create or replace view api.quotation_item_financials
  with (security_invoker = on) as
SELECT t.item_id,
    t.organization_id,
    t.version_id,
    t.internal_cost_agorot,
    t.margin_agorot
   FROM ( SELECT i.id AS item_id,
            i.organization_id,
            i.version_id,
            i.internal_cost_agorot,
            i.line_total_agorot - i.internal_cost_agorot AS margin_agorot
           FROM core.quotation_items i) t
  WHERE private.has_role(t.organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]);

create or replace view api.quotation_items
  with (security_invoker = on) as
SELECT i.id AS item_id,
    i.organization_id,
    i.version_id,
    i.window_id,
    i.room_name,
    i.window_name,
    i.description,
    i.width_cm,
    i.height_cm,
    i.running_meters,
    i.quantity,
    i.category,
    i.band,
    i.unit_price_agorot,
    i.line_total_agorot,
    i.fabric_meters,
    i.lining_meters,
    i.sort_order
   FROM core.quotation_items i;

create or replace view api.quotation_version_financials
  with (security_invoker = on) as
SELECT t.version_id,
    t.organization_id,
    t.internal_cost_agorot,
    t.margin_percent,
    t.margin_agorot
   FROM ( SELECT ver.id AS version_id,
            ver.organization_id,
            ver.internal_cost_agorot,
            ver.margin_percent,
            ver.subtotal_agorot - ver.discount_agorot - ver.internal_cost_agorot AS margin_agorot
           FROM core.quotation_versions ver) t
  WHERE private.has_role(t.organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]);

create or replace view api.quotation_versions
  with (security_invoker = on) as
SELECT ver.id AS version_id,
    ver.organization_id,
    ver.quotation_id,
    ver.version_number,
    ver.status,
    ver.subtotal_agorot,
    ver.discount_percent,
    ver.discount_agorot,
    ver.vat_agorot,
    ver.total_agorot,
    ver.valid_until,
    ver.valid_until < now() AS is_expired,
    ver.note,
    ver.created_by,
    ver.created_at,
    ver.sent_at,
    ver.approved_at,
    ver.locked,
    ver.rejected_at,
    ver.superseded_at,
    ver.sent_by,
    ver.decision_recorded_by,
    ver.decision_note,
        CASE
            WHEN ver.status = 'sent'::core.quotation_status AND ver.valid_until < now() THEN 'expired'::core.quotation_status
            ELSE ver.status
        END AS effective_status
   FROM core.quotation_versions ver;

create or replace view api.quotations
  with (security_invoker = on) as
SELECT q.id AS quotation_id,
    q.organization_id,
    q.project_id,
    q.number,
    q.status,
    q.current_version_id,
    q.created_at,
    q.updated_at
   FROM core.quotations q;

create or replace view api.roll_balances
  with (security_invoker = on) as
SELECT m.roll_id,
    m.organization_id,
    round(COALESCE(sum(m.quantity_m * e.on_hand_sign::numeric), 0::numeric), 3) AS on_hand_m,
    GREATEST(0::numeric, round(COALESCE(sum(m.quantity_m * e.reserved_sign::numeric), 0::numeric), 3)) AS reserved_m,
    round(COALESCE(sum(m.quantity_m) FILTER (WHERE m.type = ANY (ARRAY['consumption'::core.movement_type, 'overconsumption'::core.movement_type])), 0::numeric), 3) AS consumed_m
   FROM core.stock_movements m
     JOIN core.movement_effects e ON e.type = m.type
  GROUP BY m.roll_id, m.organization_id;

create or replace view api.rooms
  with (security_invoker = on) as
SELECT rooms.id AS room_id,
    rooms.organization_id,
    rooms.project_id,
    rooms.name,
    rooms.floor,
    rooms.sort_order
   FROM core.rooms;

create or replace view api.stock_movements
  with (security_invoker = on) as
SELECT m.id AS movement_id,
    m.organization_id,
    m.roll_id,
    r.code AS roll_code,
    m.type,
    m.quantity_m,
        CASE
            WHEN e.on_hand_sign > 0 THEN 'in'::text
            WHEN e.on_hand_sign < 0 THEN 'out'::text
            ELSE 'hold'::text
        END AS direction,
    m.project_id,
    m.reservation_id,
    m.reason_code,
    mr.label_ar AS reason_label,
    m.notes,
    m.created_by,
    p.full_name AS created_by_name,
    m.created_at,
    m.operation_group_id,
    m.fabric_usage_id
   FROM core.stock_movements m
     JOIN core.movement_effects e ON e.type = m.type
     JOIN core.fabric_rolls r ON r.id = m.roll_id
     LEFT JOIN core.movement_reasons mr ON mr.code = m.reason_code
     LEFT JOIN core.profiles p ON p.id = m.created_by;

create or replace view api.tailor_assignments
  with (security_invoker = on) as
SELECT tailor_assignments.id AS assignment_id,
    tailor_assignments.organization_id,
    tailor_assignments.project_id,
    tailor_assignments.tailor_id,
    tailor_assignments.stage,
    tailor_assignments.instructions,
    tailor_assignments.due_date,
    tailor_assignments.started_at,
    tailor_assignments.completed_at,
    tailor_assignments.stage_history,
    tailor_assignments.updated_at
   FROM core.tailor_assignments;

create or replace view api.tailor_project_details
  with (security_invoker = on) as
SELECT p.id AS project_id,
    p.organization_id,
    p.code,
    p.title,
    p.status_code,
    p.installation_date,
    t.stage,
    t.instructions,
    t.due_date,
    t.started_at,
    t.completed_at,
    ( SELECT count(*) AS count
           FROM core.windows w
          WHERE w.project_id = p.id) AS window_count,
    ( SELECT COALESCE(sum(round(w.width_cm / 100.0 * w.quantity::numeric * w.fullness, 3)), 0::numeric) AS "coalesce"
           FROM core.windows w
          WHERE w.project_id = p.id) AS total_fabric_meters
   FROM core.projects p
     JOIN core.tailor_assignments t ON t.project_id = p.id
  WHERE p.archived_at IS NULL AND private.has_role(p.organization_id, ARRAY['admin'::core.app_role, 'tailor'::core.app_role]);

create or replace view api.team_members
  with (security_invoker = on) as
SELECT om.organization_id,
    om.user_id,
    p.full_name,
    p.phone,
    p.title,
    p.avatar_url,
    om.role,
    om.is_active
   FROM core.organization_members om
     JOIN core.profiles p ON p.id = om.user_id;

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

create or replace view api.windows
  with (security_invoker = on) as
SELECT windows.id AS window_id,
    windows.organization_id,
    windows.project_id,
    windows.room_id,
    windows.name,
    windows.width_cm,
    windows.height_cm,
    windows.model,
    windows.has_lining,
    windows.track,
    windows.fullness,
    windows.quantity,
    windows.fabric_variant_id,
    windows.lining_variant_id,
    windows.notes,
    windows.measured_at,
    windows.measured_by
   FROM core.windows;

create or replace view api.inventory_roll_balances
  with (security_invoker = on) as
SELECT r.id AS roll_id,
    r.organization_id,
    r.code,
    r.dye_lot,
    r.location,
    v.color_name,
    pr.name AS product_name,
    COALESCE(b.on_hand_m, 0::numeric) AS on_hand_m,
    COALESCE(b.reserved_m, 0::numeric) AS reserved_m,
    COALESCE(b.consumed_m, 0::numeric) AS consumed_m,
    GREATEST(0::numeric, COALESCE(b.on_hand_m, 0::numeric) - COALESCE(b.reserved_m, 0::numeric)) AS available_m,
    GREATEST(0::numeric, COALESCE(b.on_hand_m, 0::numeric) - COALESCE(b.reserved_m, 0::numeric)) < 20::numeric AS is_low_stock
   FROM core.fabric_rolls r
     JOIN core.fabric_variants v ON v.id = r.variant_id
     JOIN core.fabric_products pr ON pr.id = v.product_id
     LEFT JOIN api.roll_balances b ON b.roll_id = r.id
  WHERE r.retired_at IS NULL AND private.has_role(r.organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]);
