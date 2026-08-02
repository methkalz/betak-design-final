-- ════════════════════════════════════════════════════════════════════
-- الفهارس (33)
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE INDEX attachments_project_idx ON core.attachments USING btree (organization_id, project_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON core.audit_logs USING btree (organization_id, entity, entity_id);
CREATE INDEX audit_logs_org_created_idx ON core.audit_logs USING btree (organization_id, created_at DESC);
CREATE INDEX client_operations_user_state_idx ON core.client_operations USING btree (organization_id, user_id, state) WHERE (state <> 'synced'::core.sync_state);
CREATE INDEX customers_org_active_idx ON core.customers USING btree (organization_id, full_name) WHERE (archived_at IS NULL);
CREATE INDEX customers_org_phone_idx ON core.customers USING btree (organization_id, phone) WHERE (archived_at IS NULL);
CREATE INDEX discount_requests_pending_idx ON core.discount_requests USING btree (organization_id, created_at DESC) WHERE (status = 'pending'::core.discount_request_status);
CREATE INDEX field_visits_assignee_idx ON core.field_visits USING btree (organization_id, assignee_id, scheduled_at);
CREATE INDEX field_visits_project_idx ON core.field_visits USING btree (organization_id, project_id);
CREATE INDEX items_version_idx ON core.quotation_items USING btree (organization_id, version_id, sort_order);
CREATE INDEX movements_org_project_idx ON core.stock_movements USING btree (organization_id, project_id) WHERE (project_id IS NOT NULL);
CREATE INDEX movements_reservation_idx ON core.stock_movements USING btree (organization_id, reservation_id) WHERE (reservation_id IS NOT NULL);
CREATE INDEX movements_roll_created_idx ON core.stock_movements USING btree (roll_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON core.notifications USING btree (user_id, read_at) WHERE (read_at IS NULL);
CREATE INDEX organization_members_user_idx ON core.organization_members USING btree (user_id) WHERE is_active;
CREATE INDEX payments_project_idx ON core.payments USING btree (organization_id, project_id, created_at DESC);
CREATE INDEX projects_field_worker_idx ON core.projects USING btree (organization_id, field_worker_id) WHERE (field_worker_id IS NOT NULL);
CREATE INDEX projects_install_date_idx ON core.projects USING btree (organization_id, installation_date) WHERE (installation_date IS NOT NULL);
CREATE INDEX projects_org_customer_idx ON core.projects USING btree (organization_id, customer_id);
CREATE INDEX projects_org_status_idx ON core.projects USING btree (organization_id, status_code);
CREATE INDEX projects_tailor_idx ON core.projects USING btree (organization_id, tailor_id) WHERE (tailor_id IS NOT NULL);
CREATE INDEX quotations_project_idx ON core.quotations USING btree (organization_id, project_id);
CREATE INDEX reservations_project_idx ON core.fabric_reservations USING btree (organization_id, project_id);
CREATE INDEX reservations_roll_open_idx ON core.fabric_reservations USING btree (organization_id, roll_id) WHERE (status = ANY (ARRAY['active'::core.reservation_status, 'partially_consumed'::core.reservation_status]));
CREATE INDEX rolls_variant_idx ON core.fabric_rolls USING btree (organization_id, variant_id) WHERE (retired_at IS NULL);
CREATE INDEX rooms_project_idx ON core.rooms USING btree (organization_id, project_id, sort_order);
CREATE INDEX stock_movements_operation_group_idx ON core.stock_movements USING btree (operation_group_id) WHERE (operation_group_id IS NOT NULL);
CREATE INDEX tailor_assignments_tailor_idx ON core.tailor_assignments USING btree (organization_id, tailor_id, stage);
CREATE INDEX usage_reservation_idx ON core.fabric_usage USING btree (organization_id, reservation_id);
CREATE INDEX variants_product_idx ON core.fabric_variants USING btree (organization_id, product_id) WHERE (archived_at IS NULL);
CREATE INDEX versions_quotation_idx ON core.quotation_versions USING btree (organization_id, quotation_id, version_number DESC);
CREATE INDEX windows_project_idx ON core.windows USING btree (organization_id, project_id);
CREATE INDEX windows_room_idx ON core.windows USING btree (organization_id, room_id);
