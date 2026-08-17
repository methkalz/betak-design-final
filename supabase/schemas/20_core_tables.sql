-- ════════════════════════════════════════════════════════════════════
-- الجداول (31) والقيم الافتراضية (0)
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE core.attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    room_id uuid,
    window_id uuid,
    visit_id uuid,
    kind core.attachment_kind NOT NULL,
    storage_path text NOT NULL,
    caption text DEFAULT ''::text NOT NULL,
    byte_size bigint,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT attachments_byte_size_check CHECK ((byte_size >= 0)),
    CONSTRAINT attachments_storage_path_check CHECK ((length(btrim(storage_path)) > 0))
);

CREATE TABLE core.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id text DEFAULT ''::text NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_logs_action_check CHECK ((length(btrim(action)) > 0))
);

CREATE TABLE core.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profiles_full_name_check CHECK ((length(btrim(full_name)) > 0))
);

CREATE TABLE core.business_settings (
    organization_id uuid NOT NULL,
    track_cost_per_meter_agorot bigint DEFAULT 1000 NOT NULL,
    delivery_cost_per_meter_agorot bigint DEFAULT 1000 NOT NULL,
    measure_install_cost_per_meter_agorot bigint DEFAULT 3000 NOT NULL,
    lining_cost_per_meter_agorot bigint DEFAULT 900 NOT NULL,
    min_margin_percent numeric(5,2) DEFAULT 35 NOT NULL,
    employee_discount_limit_percent numeric(5,2) DEFAULT 5 NOT NULL,
    admin_discount_limit_percent numeric(5,2) DEFAULT 10 NOT NULL,
    quotation_validity_days integer DEFAULT 14 NOT NULL,
    vat_percent numeric(5,2) DEFAULT 18 NOT NULL,
    currency character(3) DEFAULT 'ILS'::bpchar NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    timezone text DEFAULT 'Asia/Jerusalem'::text NOT NULL,
    field_visit_wage_agorot bigint DEFAULT 0 NOT NULL,
    motorized_track_cost_per_meter_agorot bigint DEFAULT 0 NOT NULL,
    motorized_track_price_per_meter_agorot bigint DEFAULT 0 NOT NULL,
    motor_cost_agorot bigint DEFAULT 0 NOT NULL,
    motor_price_agorot bigint DEFAULT 0 NOT NULL,
    remote_cost_agorot bigint DEFAULT 0 NOT NULL,
    remote_price_agorot bigint DEFAULT 0 NOT NULL,
    CONSTRAINT business_settings_admin_discount_limit_percent_check CHECK (((admin_discount_limit_percent >= (0)::numeric) AND (admin_discount_limit_percent <= (100)::numeric))),
    CONSTRAINT business_settings_delivery_cost_per_meter_agorot_check CHECK ((delivery_cost_per_meter_agorot >= 0)),
    CONSTRAINT business_settings_employee_discount_limit_percent_check CHECK (((employee_discount_limit_percent >= (0)::numeric) AND (employee_discount_limit_percent <= (100)::numeric))),
    CONSTRAINT business_settings_field_visit_wage_agorot_check CHECK ((field_visit_wage_agorot >= 0)),
    CONSTRAINT business_settings_lining_cost_per_meter_agorot_check CHECK ((lining_cost_per_meter_agorot >= 0)),
    CONSTRAINT business_settings_measure_install_cost_per_meter_agorot_check CHECK ((measure_install_cost_per_meter_agorot >= 0)),
    CONSTRAINT business_settings_min_margin_percent_check CHECK (((min_margin_percent >= (0)::numeric) AND (min_margin_percent <= (100)::numeric))),
    CONSTRAINT business_settings_motor_cost_agorot_check CHECK ((motor_cost_agorot >= 0)),
    CONSTRAINT business_settings_motor_price_agorot_check CHECK ((motor_price_agorot >= 0)),
    CONSTRAINT business_settings_motorized_track_cost_check CHECK ((motorized_track_cost_per_meter_agorot >= 0)),
    CONSTRAINT business_settings_motorized_track_price_check CHECK ((motorized_track_price_per_meter_agorot >= 0)),
    CONSTRAINT business_settings_quotation_validity_days_check CHECK ((quotation_validity_days > 0)),
    CONSTRAINT business_settings_remote_cost_agorot_check CHECK ((remote_cost_agorot >= 0)),
    CONSTRAINT business_settings_remote_price_agorot_check CHECK ((remote_price_agorot >= 0)),
    CONSTRAINT business_settings_timezone_check CHECK ((length(btrim(timezone)) > 0)),
    CONSTRAINT business_settings_track_cost_per_meter_agorot_check CHECK ((track_cost_per_meter_agorot >= 0)),
    CONSTRAINT business_settings_vat_percent_check CHECK (((vat_percent >= (0)::numeric) AND (vat_percent <= (100)::numeric))),
    CONSTRAINT discount_limits_ordered CHECK ((employee_discount_limit_percent <= admin_discount_limit_percent))
);

CREATE TABLE core.client_operations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_operation_id uuid NOT NULL,
    idempotency_key uuid NOT NULL,
    kind text NOT NULL,
    entity_id text DEFAULT ''::text NOT NULL,
    state core.sync_state DEFAULT 'pending'::core.sync_state NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    error text,
    result jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    synced_at timestamp with time zone,
    payload jsonb,
    CONSTRAINT client_operations_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT client_operations_kind_check CHECK ((length(btrim(kind)) > 0))
);

CREATE TABLE core.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    full_name text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    city text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    preferences text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT customers_full_name_check CHECK ((length(btrim(full_name)) > 0))
);

CREATE TABLE core.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    amount_agorot bigint NOT NULL,
    kind core.payment_kind NOT NULL,
    method core.payment_method NOT NULL,
    reference text DEFAULT ''::text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    reversed_payment_id uuid,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    due_at timestamp with time zone,
    photo_uri text DEFAULT ''::text NOT NULL,
    CONSTRAINT payments_amount_agorot_check CHECK ((amount_agorot <> 0)),
    CONSTRAINT reversal_needs_note CHECK (((kind <> 'reversal'::core.payment_kind) OR (length(btrim(note)) > 0))),
    CONSTRAINT reversal_shape CHECK ((((kind = 'reversal'::core.payment_kind) AND (amount_agorot < 0) AND (reversed_payment_id IS NOT NULL)) OR ((kind <> 'reversal'::core.payment_kind) AND (amount_agorot > 0) AND (reversed_payment_id IS NULL))))
);

CREATE TABLE core.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    code text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    status_code text DEFAULT 'new_request'::text NOT NULL,
    priority core.priority DEFAULT 'normal'::core.priority NOT NULL,
    field_worker_id uuid,
    tailor_id uuid,
    measurement_date timestamp with time zone,
    installation_date timestamp with time zone,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    lock_version integer DEFAULT 1 NOT NULL,
    measurement_worker_id uuid,
    installer_id uuid,
    parent_project_id uuid,
    annex_seq integer DEFAULT 0 NOT NULL,
    annex_reason text DEFAULT ''::text NOT NULL,
    root_project_id uuid GENERATED ALWAYS AS (COALESCE(parent_project_id, id)) STORED,
    CONSTRAINT projects_annex_not_self CHECK ((parent_project_id IS DISTINCT FROM id)),
    CONSTRAINT projects_annex_seq_shape CHECK (
      ((parent_project_id IS NULL AND annex_seq = 0)
       OR (parent_project_id IS NOT NULL AND annex_seq > 0))),
    CONSTRAINT projects_code_check CHECK ((length(btrim(code)) > 0)),
    CONSTRAINT projects_lock_version_check CHECK ((lock_version > 0))
);

CREATE TABLE core.discount_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    quotation_id uuid NOT NULL,
    version_id uuid NOT NULL,
    requested_percent numeric(5,2) NOT NULL,
    reason text NOT NULL,
    status core.discount_request_status DEFAULT 'pending'::core.discount_request_status NOT NULL,
    requested_by uuid NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    decision_note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    content_fingerprint text NOT NULL,
    CONSTRAINT decision_is_complete CHECK ((((status = 'pending'::core.discount_request_status) AND (decided_by IS NULL) AND (decided_at IS NULL)) OR ((status <> 'pending'::core.discount_request_status) AND (decided_by IS NOT NULL) AND (decided_at IS NOT NULL)))),
    CONSTRAINT discount_requests_fingerprint_check CHECK ((length(btrim(content_fingerprint)) > 0)),
    CONSTRAINT discount_requests_reason_check CHECK ((length(btrim(reason)) > 0)),
    CONSTRAINT discount_requests_requested_percent_check CHECK (((requested_percent > (0)::numeric) AND (requested_percent <= (100)::numeric)))
);

CREATE TABLE core.fabric_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    kind core.fabric_kind NOT NULL,
    supplier text DEFAULT ''::text NOT NULL,
    width_cm numeric(10,2) NOT NULL,
    composition text DEFAULT ''::text NOT NULL,
    image_url text,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fabric_products_name_check CHECK ((length(btrim(name)) > 0)),
    CONSTRAINT fabric_products_width_cm_check CHECK ((width_cm > (0)::numeric))
);

CREATE TABLE core.fabric_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    roll_id uuid NOT NULL,
    quantity_m numeric(12,3) NOT NULL,
    consumed_m numeric(12,3) DEFAULT 0 NOT NULL,
    status core.reservation_status DEFAULT 'active'::core.reservation_status NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    released_at timestamp with time zone,
    released_m numeric(12,3) DEFAULT 0 NOT NULL,
    damaged_reserved_m numeric(12,3) DEFAULT 0 NOT NULL,
    finalized_at timestamp with time zone,
    CONSTRAINT fabric_reservations_consumed_m_check CHECK ((consumed_m >= (0)::numeric)),
    CONSTRAINT fabric_reservations_damaged_reserved_m_check CHECK ((damaged_reserved_m >= (0)::numeric)),
    CONSTRAINT fabric_reservations_quantity_m_check CHECK ((quantity_m > (0)::numeric)),
    CONSTRAINT fabric_reservations_released_m_check CHECK ((released_m >= (0)::numeric)),
    CONSTRAINT reservation_balance_invariant CHECK ((((consumed_m + released_m) + damaged_reserved_m) <= quantity_m))
);

CREATE TABLE core.fabric_rolls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    code text NOT NULL,
    dye_lot text DEFAULT ''::text NOT NULL,
    location text DEFAULT ''::text NOT NULL,
    initial_meters numeric(12,3) NOT NULL,
    is_mini_roll boolean DEFAULT false NOT NULL,
    retired_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_tailor_id uuid,
    CONSTRAINT fabric_rolls_code_check CHECK ((length(btrim(code)) > 0)),
    CONSTRAINT fabric_rolls_initial_meters_check CHECK ((initial_meters >= (0)::numeric))
);

CREATE TABLE core.fabric_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid NOT NULL,
    color_name text NOT NULL,
    color_hex text DEFAULT '#CCCCCC'::text NOT NULL,
    sku text NOT NULL,
    cost_per_meter_agorot bigint NOT NULL,
    image_url text,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_surcharge_per_meter_agorot bigint DEFAULT 0 NOT NULL,
    meters_per_running_meter numeric(6,3) DEFAULT 0 NOT NULL,
    CONSTRAINT fabric_variants_color_hex_check CHECK ((color_hex ~ '^#[0-9A-Fa-f]{6}$'::text)),
    CONSTRAINT fabric_variants_color_name_check CHECK ((length(btrim(color_name)) > 0)),
    CONSTRAINT fabric_variants_cost_per_meter_agorot_check CHECK ((cost_per_meter_agorot >= 0)),
    CONSTRAINT fabric_variants_customer_surcharge_check CHECK ((customer_surcharge_per_meter_agorot >= 0)),
    CONSTRAINT fabric_variants_meters_per_running_meter_check CHECK ((meters_per_running_meter >= (0)::numeric))
);

CREATE TABLE core.fabric_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    reservation_id uuid NOT NULL,
    roll_id uuid NOT NULL,
    planned_m numeric(12,3) NOT NULL,
    actual_m numeric(12,3) NOT NULL,
    waste_m numeric(12,3) DEFAULT 0 NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reason_code text,
    window_id uuid,
    CONSTRAINT fabric_usage_actual_m_check CHECK ((actual_m >= (0)::numeric)),
    CONSTRAINT fabric_usage_planned_m_check CHECK ((planned_m >= (0)::numeric)),
    CONSTRAINT fabric_usage_waste_m_check CHECK ((waste_m >= (0)::numeric)),
    CONSTRAINT reason_code_required_for_waste CHECK (((waste_m = (0)::numeric) OR (reason_code IS NOT NULL))),
    CONSTRAINT reason_code_required_when_over_plan CHECK (((actual_m <= planned_m) OR (reason_code IS NOT NULL))),
    CONSTRAINT usage_actual_equals_planned_plus_waste CHECK ((actual_m = (planned_m + waste_m)))
);

CREATE TABLE core.movement_reasons (
    code text NOT NULL,
    label_ar text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    applies_to core.movement_type[] DEFAULT '{}'::core.movement_type[] NOT NULL,
    CONSTRAINT movement_reasons_code_check CHECK ((code ~ '^[a-z][a-z0-9_]{2,40}$'::text)),
    CONSTRAINT movement_reasons_label_ar_check CHECK ((length(btrim(label_ar)) > 0)),
    CONSTRAINT reasons_have_scope CHECK ((cardinality(applies_to) > 0))
);

CREATE TABLE core.field_visits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    assignee_id uuid NOT NULL,
    type core.visit_type NOT NULL,
    status core.visit_status DEFAULT 'scheduled'::core.visit_status NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    notes text DEFAULT ''::text NOT NULL,
    check_track boolean DEFAULT false NOT NULL,
    check_curtain boolean DEFAULT false NOT NULL,
    check_height boolean DEFAULT false NOT NULL,
    check_cleanliness boolean DEFAULT false NOT NULL,
    customer_signed_off boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT completed_visits_have_timestamp CHECK (((status <> 'completed'::core.visit_status) OR (completed_at IS NOT NULL)))
);

CREATE TABLE core.movement_effects (
    type core.movement_type NOT NULL,
    on_hand_sign smallint NOT NULL,
    reserved_sign smallint NOT NULL,
    label_ar text NOT NULL,
    CONSTRAINT movement_effects_on_hand_sign_check CHECK ((on_hand_sign = ANY (ARRAY['-1'::integer, 0, 1]))),
    CONSTRAINT movement_effects_reserved_sign_check CHECK ((reserved_sign = ANY (ARRAY['-1'::integer, 0, 1])))
);

CREATE TABLE core.stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    roll_id uuid NOT NULL,
    type core.movement_type NOT NULL,
    quantity_m numeric(12,3) NOT NULL,
    project_id uuid,
    reservation_id uuid,
    notes text DEFAULT ''::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key uuid NOT NULL,
    operation_group_id uuid,
    fabric_usage_id uuid,
    reason_code text,
    CONSTRAINT fabric_usage_link_shape CHECK ((((type = 'return'::core.movement_type) AND (fabric_usage_id IS NOT NULL) AND (project_id IS NOT NULL) AND (reservation_id IS NOT NULL)) OR ((type <> 'return'::core.movement_type) AND (fabric_usage_id IS NULL)))),
    CONSTRAINT reason_code_required_for_exceptions CHECK (((type <> ALL (ARRAY['damage'::core.movement_type, 'damage_reserved'::core.movement_type, 'adjustment_in'::core.movement_type, 'adjustment_out'::core.movement_type, 'overconsumption'::core.movement_type, 'return'::core.movement_type])) OR (reason_code IS NOT NULL))),
    CONSTRAINT reservation_required CHECK (((type <> ALL (ARRAY['reservation'::core.movement_type, 'reservation_release'::core.movement_type, 'consumption'::core.movement_type, 'overconsumption'::core.movement_type, 'damage_reserved'::core.movement_type])) OR (reservation_id IS NOT NULL))),
    CONSTRAINT stock_movements_quantity_m_check CHECK ((quantity_m > (0)::numeric))
);

CREATE TABLE core.organization_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role core.app_role NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE core.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    kind core.notification_kind NOT NULL,
    title text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    deep_link text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_title_check CHECK ((length(btrim(title)) > 0))
);

CREATE TABLE core.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT organizations_name_check CHECK ((length(btrim(name)) > 0))
);

CREATE TABLE core.pricing_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    band core.height_band NOT NULL,
    category core.pricing_category NOT NULL,
    customer_price_per_meter_agorot bigint NOT NULL,
    tailor_cost_per_meter_agorot bigint NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pricing_rules_customer_price_per_meter_agorot_check CHECK ((customer_price_per_meter_agorot >= 0)),
    CONSTRAINT pricing_rules_tailor_cost_per_meter_agorot_check CHECK ((tailor_cost_per_meter_agorot >= 0))
);

CREATE TABLE core.project_statuses (
    status_code text NOT NULL,
    label_ar text NOT NULL,
    sort_order integer NOT NULL,
    is_terminal boolean DEFAULT false NOT NULL
);

CREATE TABLE core.rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    floor text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rooms_name_check CHECK ((length(btrim(name)) > 0))
);

CREATE TABLE core.windows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    room_id uuid NOT NULL,
    name text NOT NULL,
    width_cm numeric(10,2) NOT NULL,
    height_cm numeric(10,2) NOT NULL,
    model core.curtain_model DEFAULT 'wave'::core.curtain_model NOT NULL,
    has_lining boolean DEFAULT false NOT NULL,
    track core.track_type DEFAULT 'ceiling_rail'::core.track_type NOT NULL,
    fullness numeric(6,3) DEFAULT 3 NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    fabric_variant_id uuid,
    lining_variant_id uuid,
    notes text DEFAULT ''::text NOT NULL,
    measured_at timestamp with time zone,
    measured_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT windows_fullness_check CHECK ((fullness > (0)::numeric)),
    CONSTRAINT windows_height_cm_check CHECK ((height_cm > (0)::numeric)),
    CONSTRAINT windows_name_check CHECK ((length(btrim(name)) > 0)),
    CONSTRAINT windows_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT windows_width_cm_check CHECK ((width_cm > (0)::numeric))
);

CREATE TABLE core.quotation_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    version_id uuid NOT NULL,
    window_id uuid,
    room_name text DEFAULT ''::text NOT NULL,
    window_name text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    width_cm numeric(10,2) NOT NULL,
    height_cm numeric(10,2) NOT NULL,
    running_meters numeric(12,3) NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    category core.pricing_category NOT NULL,
    band core.height_band NOT NULL,
    unit_price_agorot bigint NOT NULL,
    line_total_agorot bigint NOT NULL,
    internal_cost_agorot bigint NOT NULL,
    fabric_meters numeric(12,3) DEFAULT 0 NOT NULL,
    lining_meters numeric(12,3) DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT quotation_items_fabric_meters_check CHECK ((fabric_meters >= (0)::numeric)),
    CONSTRAINT quotation_items_height_cm_check CHECK ((height_cm > (0)::numeric)),
    CONSTRAINT quotation_items_internal_cost_agorot_check CHECK ((internal_cost_agorot >= 0)),
    CONSTRAINT quotation_items_line_total_agorot_check CHECK ((line_total_agorot >= 0)),
    CONSTRAINT quotation_items_lining_meters_check CHECK ((lining_meters >= (0)::numeric)),
    CONSTRAINT quotation_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT quotation_items_running_meters_check CHECK ((running_meters >= (0)::numeric)),
    CONSTRAINT quotation_items_unit_price_agorot_check CHECK ((unit_price_agorot >= 0)),
    CONSTRAINT quotation_items_width_cm_check CHECK ((width_cm > (0)::numeric))
);

CREATE TABLE core.quotation_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    quotation_id uuid NOT NULL,
    version_number integer NOT NULL,
    status core.quotation_status DEFAULT 'draft'::core.quotation_status NOT NULL,
    subtotal_agorot bigint DEFAULT 0 NOT NULL,
    discount_percent numeric(5,2) DEFAULT 0 NOT NULL,
    discount_agorot bigint DEFAULT 0 NOT NULL,
    vat_agorot bigint DEFAULT 0 NOT NULL,
    total_agorot bigint DEFAULT 0 NOT NULL,
    internal_cost_agorot bigint DEFAULT 0 NOT NULL,
    margin_percent numeric(6,2) DEFAULT 0 NOT NULL,
    valid_until timestamp with time zone NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    approved_at timestamp with time zone,
    locked boolean DEFAULT false NOT NULL,
    sent_by uuid,
    rejected_at timestamp with time zone,
    superseded_at timestamp with time zone,
    decision_recorded_by uuid,
    decision_note text DEFAULT ''::text NOT NULL,
    pricing_context jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT discount_within_subtotal CHECK ((discount_agorot <= subtotal_agorot)),
    CONSTRAINT quotation_versions_discount_agorot_check CHECK ((discount_agorot >= 0)),
    CONSTRAINT quotation_versions_discount_percent_check CHECK (((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric))),
    CONSTRAINT quotation_versions_internal_cost_agorot_check CHECK ((internal_cost_agorot >= 0)),
    CONSTRAINT quotation_versions_subtotal_agorot_check CHECK ((subtotal_agorot >= 0)),
    CONSTRAINT quotation_versions_total_agorot_check CHECK ((total_agorot >= 0)),
    CONSTRAINT quotation_versions_vat_agorot_check CHECK ((vat_agorot >= 0)),
    CONSTRAINT quotation_versions_version_number_check CHECK ((version_number > 0)),
    CONSTRAINT version_lifecycle_shape CHECK (
CASE status
    WHEN 'draft'::core.quotation_status THEN ((sent_at IS NULL) AND (sent_by IS NULL) AND (locked = false) AND (approved_at IS NULL) AND (rejected_at IS NULL) AND (superseded_at IS NULL) AND (decision_recorded_by IS NULL))
    WHEN 'sent'::core.quotation_status THEN ((sent_at IS NOT NULL) AND (sent_by IS NOT NULL) AND locked AND (approved_at IS NULL) AND (rejected_at IS NULL) AND (superseded_at IS NULL) AND (decision_recorded_by IS NULL))
    WHEN 'approved'::core.quotation_status THEN ((sent_at IS NOT NULL) AND (sent_by IS NOT NULL) AND locked AND (approved_at IS NOT NULL) AND (decision_recorded_by IS NOT NULL) AND (rejected_at IS NULL) AND (superseded_at IS NULL))
    WHEN 'rejected'::core.quotation_status THEN ((sent_at IS NOT NULL) AND (sent_by IS NOT NULL) AND locked AND (rejected_at IS NOT NULL) AND (decision_recorded_by IS NOT NULL) AND (length(btrim(decision_note)) > 0) AND (approved_at IS NULL) AND (superseded_at IS NULL))
    WHEN 'expired'::core.quotation_status THEN ((sent_at IS NOT NULL) AND (sent_by IS NOT NULL) AND locked AND (approved_at IS NULL) AND (rejected_at IS NULL) AND (decision_recorded_by IS NULL))
    WHEN 'superseded'::core.quotation_status THEN (locked AND (superseded_at IS NOT NULL) AND ((sent_at IS NULL) = (sent_by IS NULL)) AND (approved_at IS NULL) AND (rejected_at IS NULL))
    ELSE false
END)
);

CREATE TABLE core.quotations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    number text NOT NULL,
    status core.quotation_status DEFAULT 'draft'::core.quotation_status NOT NULL,
    current_version_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT quotations_number_check CHECK ((length(btrim(number)) > 0))
);

CREATE TABLE core.tailor_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    tailor_id uuid NOT NULL,
    stage core.tailor_stage DEFAULT 'received'::core.tailor_stage NOT NULL,
    instructions text DEFAULT ''::text NOT NULL,
    due_date timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    stage_history jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tailor_assignments_stage_history_check CHECK ((jsonb_typeof(stage_history) = 'array'::text))
);

CREATE TABLE core.document_sequences (
    organization_id uuid NOT NULL,
    doc_type text NOT NULL,
    year integer NOT NULL,
    last_number integer DEFAULT 0 NOT NULL,
    CONSTRAINT document_sequences_doc_type_check CHECK ((length(btrim(doc_type)) > 0)),
    CONSTRAINT document_sequences_last_number_check CHECK ((last_number >= 0)),
    CONSTRAINT document_sequences_year_check CHECK (((year >= 2000) AND (year <= 2100)))
);

CREATE TABLE core.staff_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    amount_agorot bigint NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staff_ledger_amount_positive CHECK ((amount_agorot > 0)),
    CONSTRAINT staff_ledger_whole_shekel CHECK (((amount_agorot % 100) = 0))
);

CREATE TABLE core.user_devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    expo_push_token text NOT NULL,
    platform text NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_devices_expo_push_token_check CHECK ((length(btrim(expo_push_token)) > 0)),
    CONSTRAINT user_devices_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text])))
);
