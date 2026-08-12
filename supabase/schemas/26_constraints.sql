-- ════════════════════════════════════════════════════════════════════
-- القيود والمفاتيح (156)
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE ONLY core.attachments
    ADD CONSTRAINT attachments_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.attachments
    ADD CONSTRAINT attachments_organization_id_storage_path_key UNIQUE (organization_id, storage_path);
ALTER TABLE ONLY core.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.audit_logs
    ADD CONSTRAINT audit_logs_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.business_settings
    ADD CONSTRAINT business_settings_pkey PRIMARY KEY (organization_id);
ALTER TABLE ONLY core.client_operations
    ADD CONSTRAINT client_operations_organization_id_client_operation_id_key UNIQUE (organization_id, client_operation_id);
ALTER TABLE ONLY core.client_operations
    ADD CONSTRAINT client_operations_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.client_operations
    ADD CONSTRAINT client_operations_organization_id_idempotency_key_key UNIQUE (organization_id, idempotency_key);
ALTER TABLE ONLY core.client_operations
    ADD CONSTRAINT client_operations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.customers
    ADD CONSTRAINT customers_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.discount_requests
    ADD CONSTRAINT discount_requests_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.discount_requests
    ADD CONSTRAINT discount_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.document_sequences
    ADD CONSTRAINT document_sequences_pkey PRIMARY KEY (organization_id, doc_type, year);
ALTER TABLE ONLY core.fabric_products
    ADD CONSTRAINT fabric_products_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.fabric_products
    ADD CONSTRAINT fabric_products_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.fabric_reservations
    ADD CONSTRAINT fabric_reservations_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.fabric_reservations
    ADD CONSTRAINT fabric_reservations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.fabric_rolls
    ADD CONSTRAINT fabric_rolls_organization_id_code_key UNIQUE (organization_id, code);
ALTER TABLE ONLY core.fabric_rolls
    ADD CONSTRAINT fabric_rolls_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.fabric_rolls
    ADD CONSTRAINT fabric_rolls_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.fabric_usage
    ADD CONSTRAINT fabric_usage_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.fabric_usage
    ADD CONSTRAINT fabric_usage_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.fabric_variants
    ADD CONSTRAINT fabric_variants_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.fabric_variants
    ADD CONSTRAINT fabric_variants_organization_id_sku_key UNIQUE (organization_id, sku);
ALTER TABLE ONLY core.fabric_variants
    ADD CONSTRAINT fabric_variants_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.field_visits
    ADD CONSTRAINT field_visits_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.field_visits
    ADD CONSTRAINT field_visits_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.movement_effects
    ADD CONSTRAINT movement_effects_pkey PRIMARY KEY (type);
ALTER TABLE ONLY core.movement_reasons
    ADD CONSTRAINT movement_reasons_pkey PRIMARY KEY (code);
ALTER TABLE ONLY core.notifications
    ADD CONSTRAINT notifications_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.organization_members
    ADD CONSTRAINT organization_members_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.organization_members
    ADD CONSTRAINT organization_members_organization_id_user_id_key UNIQUE (organization_id, user_id);
ALTER TABLE ONLY core.organization_members
    ADD CONSTRAINT organization_members_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.payments
    ADD CONSTRAINT payments_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.payments
    ADD CONSTRAINT payments_organization_id_reversed_payment_id_key UNIQUE (organization_id, reversed_payment_id);
ALTER TABLE ONLY core.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.pricing_rules
    ADD CONSTRAINT pricing_rules_organization_id_band_category_key UNIQUE (organization_id, band, category);
ALTER TABLE ONLY core.pricing_rules
    ADD CONSTRAINT pricing_rules_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.pricing_rules
    ADD CONSTRAINT pricing_rules_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.project_statuses
    ADD CONSTRAINT project_statuses_pkey PRIMARY KEY (status_code);
ALTER TABLE ONLY core.project_statuses
    ADD CONSTRAINT project_statuses_sort_order_key UNIQUE (sort_order);
ALTER TABLE ONLY core.projects
    ADD CONSTRAINT projects_organization_id_code_key UNIQUE (organization_id, code);
ALTER TABLE ONLY core.projects
    ADD CONSTRAINT projects_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.quotation_items
    ADD CONSTRAINT quotation_items_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.quotation_items
    ADD CONSTRAINT quotation_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.quotation_versions
    ADD CONSTRAINT quotation_versions_org_id_quotation_key UNIQUE (organization_id, id, quotation_id);
ALTER TABLE ONLY core.quotation_versions
    ADD CONSTRAINT quotation_versions_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.quotation_versions
    ADD CONSTRAINT quotation_versions_organization_id_quotation_id_version_num_key UNIQUE (organization_id, quotation_id, version_number);
ALTER TABLE ONLY core.quotation_versions
    ADD CONSTRAINT quotation_versions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.quotations
    ADD CONSTRAINT quotations_one_per_project UNIQUE (organization_id, project_id);
ALTER TABLE ONLY core.quotations
    ADD CONSTRAINT quotations_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.quotations
    ADD CONSTRAINT quotations_organization_id_number_key UNIQUE (organization_id, number);
ALTER TABLE ONLY core.quotations
    ADD CONSTRAINT quotations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.rooms
    ADD CONSTRAINT rooms_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.stock_movements
    ADD CONSTRAINT stock_movements_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.stock_movements
    ADD CONSTRAINT stock_movements_organization_id_idempotency_key_key UNIQUE (organization_id, idempotency_key);
ALTER TABLE ONLY core.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.tailor_assignments
    ADD CONSTRAINT tailor_assignments_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.tailor_assignments
    ADD CONSTRAINT tailor_assignments_organization_id_project_id_key UNIQUE (organization_id, project_id);
ALTER TABLE ONLY core.tailor_assignments
    ADD CONSTRAINT tailor_assignments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.user_devices
    ADD CONSTRAINT user_devices_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.user_devices
    ADD CONSTRAINT user_devices_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.user_devices
    ADD CONSTRAINT user_devices_user_id_expo_push_token_key UNIQUE (user_id, expo_push_token);
ALTER TABLE ONLY core.staff_ledger
    ADD CONSTRAINT staff_ledger_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.staff_ledger
    ADD CONSTRAINT staff_ledger_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.staff_ledger
    ADD CONSTRAINT staff_ledger_organization_id_staff_id_fkey FOREIGN KEY (organization_id, staff_id) REFERENCES core.organization_members(organization_id, user_id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.staff_ledger
    ADD CONSTRAINT staff_ledger_organization_id_created_by_fkey FOREIGN KEY (organization_id, created_by) REFERENCES core.organization_members(organization_id, user_id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.windows
    ADD CONSTRAINT windows_organization_id_id_key UNIQUE (organization_id, id);
ALTER TABLE ONLY core.windows
    ADD CONSTRAINT windows_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.attachments
    ADD CONSTRAINT attachments_organization_id_created_by_fkey FOREIGN KEY (organization_id, created_by) REFERENCES core.organization_members(organization_id, user_id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.attachments
    ADD CONSTRAINT attachments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.attachments
    ADD CONSTRAINT attachments_organization_id_project_id_fkey FOREIGN KEY (organization_id, project_id) REFERENCES core.projects(organization_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY core.attachments
    ADD CONSTRAINT attachments_organization_id_room_id_fkey FOREIGN KEY (organization_id, room_id) REFERENCES core.rooms(organization_id, id) ON DELETE SET NULL (room_id);
ALTER TABLE ONLY core.attachments
    ADD CONSTRAINT attachments_organization_id_visit_id_fkey FOREIGN KEY (organization_id, visit_id) REFERENCES core.field_visits(organization_id, id) ON DELETE SET NULL (visit_id);
ALTER TABLE ONLY core.attachments
    ADD CONSTRAINT attachments_organization_id_window_id_fkey FOREIGN KEY (organization_id, window_id) REFERENCES core.windows(organization_id, id) ON DELETE SET NULL (window_id);
ALTER TABLE ONLY core.audit_logs
    ADD CONSTRAINT audit_logs_organization_id_actor_id_fkey FOREIGN KEY (organization_id, actor_id) REFERENCES core.organization_members(organization_id, user_id) ON DELETE SET NULL (actor_id);
ALTER TABLE ONLY core.audit_logs
    ADD CONSTRAINT audit_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.business_settings
    ADD CONSTRAINT business_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.client_operations
    ADD CONSTRAINT client_operations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.client_operations
    ADD CONSTRAINT client_operations_organization_id_user_id_fkey FOREIGN KEY (organization_id, user_id) REFERENCES core.organization_members(organization_id, user_id) ON DELETE CASCADE;
ALTER TABLE ONLY core.customers
    ADD CONSTRAINT customers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.discount_requests
    ADD CONSTRAINT discount_requests_organization_id_decided_by_fkey FOREIGN KEY (organization_id, decided_by) REFERENCES core.organization_members(organization_id, user_id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.discount_requests
    ADD CONSTRAINT discount_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.discount_requests
    ADD CONSTRAINT discount_requests_organization_id_quotation_id_fkey FOREIGN KEY (organization_id, quotation_id) REFERENCES core.quotations(organization_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY core.discount_requests
    ADD CONSTRAINT discount_requests_organization_id_requested_by_fkey FOREIGN KEY (organization_id, requested_by) REFERENCES core.organization_members(organization_id, user_id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.discount_requests
    ADD CONSTRAINT discount_requests_version_belongs_to_quotation_fk FOREIGN KEY (organization_id, version_id, quotation_id) REFERENCES core.quotation_versions(organization_id, id, quotation_id) ON DELETE CASCADE;
ALTER TABLE ONLY core.document_sequences
    ADD CONSTRAINT document_sequences_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.fabric_products
    ADD CONSTRAINT fabric_products_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.fabric_reservations
    ADD CONSTRAINT fabric_reservations_organization_id_created_by_fkey FOREIGN KEY (organization_id, created_by) REFERENCES core.organization_members(organization_id, user_id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.fabric_reservations
    ADD CONSTRAINT fabric_reservations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.fabric_reservations
    ADD CONSTRAINT fabric_reservations_organization_id_project_id_fkey FOREIGN KEY (organization_id, project_id) REFERENCES core.projects(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.fabric_reservations
    ADD CONSTRAINT fabric_reservations_organization_id_roll_id_fkey FOREIGN KEY (organization_id, roll_id) REFERENCES core.fabric_rolls(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.fabric_rolls
    ADD CONSTRAINT fabric_rolls_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.fabric_rolls
    ADD CONSTRAINT fabric_rolls_organization_id_assigned_tailor_id_fkey FOREIGN KEY (organization_id, assigned_tailor_id) REFERENCES core.organization_members(organization_id, user_id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.fabric_rolls
    ADD CONSTRAINT fabric_rolls_organization_id_variant_id_fkey FOREIGN KEY (organization_id, variant_id) REFERENCES core.fabric_variants(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.fabric_usage
    ADD CONSTRAINT fabric_usage_organization_id_created_by_fkey FOREIGN KEY (organization_id, created_by) REFERENCES core.organization_members(organization_id, user_id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.fabric_usage
    ADD CONSTRAINT fabric_usage_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.fabric_usage
    ADD CONSTRAINT fabric_usage_organization_id_project_id_fkey FOREIGN KEY (organization_id, project_id) REFERENCES core.projects(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.fabric_usage
    ADD CONSTRAINT fabric_usage_organization_id_reservation_id_fkey FOREIGN KEY (organization_id, reservation_id) REFERENCES core.fabric_reservations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.fabric_usage
    ADD CONSTRAINT fabric_usage_organization_id_roll_id_fkey FOREIGN KEY (organization_id, roll_id) REFERENCES core.fabric_rolls(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.fabric_usage
    ADD CONSTRAINT fabric_usage_reason_code_fkey FOREIGN KEY (reason_code) REFERENCES core.movement_reasons(code);
ALTER TABLE ONLY core.fabric_usage
    ADD CONSTRAINT fabric_usage_organization_id_window_id_fkey FOREIGN KEY (organization_id, window_id) REFERENCES core.windows(organization_id, id) ON DELETE SET NULL (window_id);
ALTER TABLE ONLY core.fabric_variants
    ADD CONSTRAINT fabric_variants_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.fabric_variants
    ADD CONSTRAINT fabric_variants_organization_id_product_id_fkey FOREIGN KEY (organization_id, product_id) REFERENCES core.fabric_products(organization_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY core.field_visits
    ADD CONSTRAINT field_visits_organization_id_assignee_id_fkey FOREIGN KEY (organization_id, assignee_id) REFERENCES core.organization_members(organization_id, user_id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.field_visits
    ADD CONSTRAINT field_visits_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.field_visits
    ADD CONSTRAINT field_visits_organization_id_project_id_fkey FOREIGN KEY (organization_id, project_id) REFERENCES core.projects(organization_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY core.notifications
    ADD CONSTRAINT notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.notifications
    ADD CONSTRAINT notifications_organization_id_user_id_fkey FOREIGN KEY (organization_id, user_id) REFERENCES core.organization_members(organization_id, user_id) ON DELETE CASCADE;
ALTER TABLE ONLY core.organization_members
    ADD CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.organization_members
    ADD CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.payments
    ADD CONSTRAINT payments_organization_id_created_by_fkey FOREIGN KEY (organization_id, created_by) REFERENCES core.organization_members(organization_id, user_id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.payments
    ADD CONSTRAINT payments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.payments
    ADD CONSTRAINT payments_organization_id_project_id_fkey FOREIGN KEY (organization_id, project_id) REFERENCES core.projects(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.payments
    ADD CONSTRAINT payments_organization_id_reversed_payment_id_fkey FOREIGN KEY (organization_id, reversed_payment_id) REFERENCES core.payments(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.pricing_rules
    ADD CONSTRAINT pricing_rules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.projects
    ADD CONSTRAINT projects_organization_id_customer_id_fkey FOREIGN KEY (organization_id, customer_id) REFERENCES core.customers(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.projects
    ADD CONSTRAINT projects_organization_id_field_worker_id_fkey FOREIGN KEY (organization_id, field_worker_id) REFERENCES core.organization_members(organization_id, user_id) ON DELETE SET NULL (field_worker_id);
ALTER TABLE ONLY core.projects
    ADD CONSTRAINT projects_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.projects
    ADD CONSTRAINT projects_organization_id_tailor_id_fkey FOREIGN KEY (organization_id, tailor_id) REFERENCES core.organization_members(organization_id, user_id) ON DELETE SET NULL (tailor_id);
ALTER TABLE ONLY core.projects
    ADD CONSTRAINT projects_organization_id_measurement_worker_id_fkey FOREIGN KEY (organization_id, measurement_worker_id) REFERENCES core.organization_members(organization_id, user_id) ON DELETE SET NULL (measurement_worker_id);
ALTER TABLE ONLY core.projects
    ADD CONSTRAINT projects_organization_id_installer_id_fkey FOREIGN KEY (organization_id, installer_id) REFERENCES core.organization_members(organization_id, user_id) ON DELETE SET NULL (installer_id);
ALTER TABLE ONLY core.projects
    ADD CONSTRAINT projects_status_code_fkey FOREIGN KEY (status_code) REFERENCES core.project_statuses(status_code);
ALTER TABLE ONLY core.quotation_items
    ADD CONSTRAINT quotation_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.quotation_items
    ADD CONSTRAINT quotation_items_organization_id_version_id_fkey FOREIGN KEY (organization_id, version_id) REFERENCES core.quotation_versions(organization_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY core.quotation_items
    ADD CONSTRAINT quotation_items_organization_id_window_id_fkey FOREIGN KEY (organization_id, window_id) REFERENCES core.windows(organization_id, id) ON DELETE SET NULL (window_id);
ALTER TABLE ONLY core.quotation_versions
    ADD CONSTRAINT quotation_versions_organization_id_created_by_fkey FOREIGN KEY (organization_id, created_by) REFERENCES core.organization_members(organization_id, user_id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.quotation_versions
    ADD CONSTRAINT quotation_versions_organization_id_decision_recorded_by_fkey FOREIGN KEY (organization_id, decision_recorded_by) REFERENCES core.organization_members(organization_id, user_id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.quotation_versions
    ADD CONSTRAINT quotation_versions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.quotation_versions
    ADD CONSTRAINT quotation_versions_organization_id_quotation_id_fkey FOREIGN KEY (organization_id, quotation_id) REFERENCES core.quotations(organization_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY core.quotation_versions
    ADD CONSTRAINT quotation_versions_organization_id_sent_by_fkey FOREIGN KEY (organization_id, sent_by) REFERENCES core.organization_members(organization_id, user_id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.quotations
    ADD CONSTRAINT quotations_current_version_fk FOREIGN KEY (organization_id, current_version_id, id) REFERENCES core.quotation_versions(organization_id, id, quotation_id) ON DELETE SET NULL (current_version_id);
ALTER TABLE ONLY core.quotations
    ADD CONSTRAINT quotations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.quotations
    ADD CONSTRAINT quotations_organization_id_project_id_fkey FOREIGN KEY (organization_id, project_id) REFERENCES core.projects(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.rooms
    ADD CONSTRAINT rooms_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.rooms
    ADD CONSTRAINT rooms_organization_id_project_id_fkey FOREIGN KEY (organization_id, project_id) REFERENCES core.projects(organization_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY core.stock_movements
    ADD CONSTRAINT stock_movements_organization_id_created_by_fkey FOREIGN KEY (organization_id, created_by) REFERENCES core.organization_members(organization_id, user_id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.stock_movements
    ADD CONSTRAINT stock_movements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.stock_movements
    ADD CONSTRAINT stock_movements_organization_id_project_id_fkey FOREIGN KEY (organization_id, project_id) REFERENCES core.projects(organization_id, id) ON DELETE SET NULL (project_id);
ALTER TABLE ONLY core.stock_movements
    ADD CONSTRAINT stock_movements_organization_id_reservation_id_fkey FOREIGN KEY (organization_id, reservation_id) REFERENCES core.fabric_reservations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.stock_movements
    ADD CONSTRAINT stock_movements_organization_id_roll_id_fkey FOREIGN KEY (organization_id, roll_id) REFERENCES core.fabric_rolls(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.stock_movements
    ADD CONSTRAINT stock_movements_reason_code_fkey FOREIGN KEY (reason_code) REFERENCES core.movement_reasons(code);
ALTER TABLE ONLY core.stock_movements
    ADD CONSTRAINT stock_movements_type_effects_fk FOREIGN KEY (type) REFERENCES core.movement_effects(type);
ALTER TABLE ONLY core.stock_movements
    ADD CONSTRAINT stock_movements_usage_consistency_fk FOREIGN KEY (organization_id, fabric_usage_id, roll_id, reservation_id, project_id) REFERENCES core.fabric_usage(organization_id, id, roll_id, reservation_id, project_id);
ALTER TABLE ONLY core.tailor_assignments
    ADD CONSTRAINT tailor_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.tailor_assignments
    ADD CONSTRAINT tailor_assignments_organization_id_project_id_fkey FOREIGN KEY (organization_id, project_id) REFERENCES core.projects(organization_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY core.tailor_assignments
    ADD CONSTRAINT tailor_assignments_organization_id_tailor_id_fkey FOREIGN KEY (organization_id, tailor_id) REFERENCES core.organization_members(organization_id, user_id) ON DELETE RESTRICT;
ALTER TABLE ONLY core.user_devices
    ADD CONSTRAINT user_devices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.user_devices
    ADD CONSTRAINT user_devices_organization_id_user_id_fkey FOREIGN KEY (organization_id, user_id) REFERENCES core.organization_members(organization_id, user_id) ON DELETE CASCADE;
ALTER TABLE ONLY core.user_devices
    ADD CONSTRAINT user_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.windows
    ADD CONSTRAINT windows_organization_id_fabric_variant_id_fkey FOREIGN KEY (organization_id, fabric_variant_id) REFERENCES core.fabric_variants(organization_id, id) ON DELETE SET NULL (fabric_variant_id);
ALTER TABLE ONLY core.windows
    ADD CONSTRAINT windows_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.windows
    ADD CONSTRAINT windows_organization_id_lining_variant_id_fkey FOREIGN KEY (organization_id, lining_variant_id) REFERENCES core.fabric_variants(organization_id, id) ON DELETE SET NULL (lining_variant_id);
ALTER TABLE ONLY core.windows
    ADD CONSTRAINT windows_organization_id_measured_by_fkey FOREIGN KEY (organization_id, measured_by) REFERENCES core.organization_members(organization_id, user_id) ON DELETE SET NULL (measured_by);
ALTER TABLE ONLY core.windows
    ADD CONSTRAINT windows_organization_id_project_id_fkey FOREIGN KEY (organization_id, project_id) REFERENCES core.projects(organization_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY core.windows
    ADD CONSTRAINT windows_organization_id_room_id_fkey FOREIGN KEY (organization_id, room_id) REFERENCES core.rooms(organization_id, id) ON DELETE CASCADE;
