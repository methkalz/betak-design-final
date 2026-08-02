-- ============================================================================
-- بيتك ديزاين — 0009 — الفهارس
-- المرجع: sql.html (الفهارس الأساسية)
--
-- قيود unique(organization_id, id) في الملفات السابقة تولد فهارسها تلقائيا،
-- فلا تكرر هنا. المضاف أدناه: مفاتيح خارجية غير مفهرسة + مسارات القراءة
-- الساخنة في التطبيق.
-- ============================================================================

-- ── الصلاحيات: أسخن مسار في النظام كله ──────────────────────────────────────
-- private.is_org_member ينادى في كل سياسة RLS تقريبا.
create index organization_members_user_idx
  on core.organization_members (user_id)
  where is_active;

-- ── الزبائن ─────────────────────────────────────────────────────────────────
create index customers_org_active_idx
  on core.customers (organization_id, full_name)
  where archived_at is null;

create index customers_org_phone_idx
  on core.customers (organization_id, phone)
  where archived_at is null;

-- ── المشاريع ────────────────────────────────────────────────────────────────
-- من sql.html حرفيا
create index projects_org_status_idx
  on core.projects (organization_id, status_code);

create index projects_org_customer_idx
  on core.projects (organization_id, customer_id);

create index projects_field_worker_idx
  on core.projects (organization_id, field_worker_id)
  where field_worker_id is not null;

create index projects_tailor_idx
  on core.projects (organization_id, tailor_id)
  where tailor_id is not null;

create index projects_install_date_idx
  on core.projects (organization_id, installation_date)
  where installation_date is not null;

-- ── الغرف والشبابيك ─────────────────────────────────────────────────────────
create index rooms_project_idx
  on core.rooms (organization_id, project_id, sort_order);

create index windows_project_idx
  on core.windows (organization_id, project_id);

create index windows_room_idx
  on core.windows (organization_id, room_id);

-- ── المخزون ─────────────────────────────────────────────────────────────────
-- من sql.html — العمود عندنا roll_id لا fabric_roll_id، اتساقا مع types/domain.ts
create index movements_roll_created_idx
  on core.stock_movements (roll_id, created_at desc);

create index movements_org_project_idx
  on core.stock_movements (organization_id, project_id)
  where project_id is not null;

create index movements_reservation_idx
  on core.stock_movements (organization_id, reservation_id)
  where reservation_id is not null;

create index reservations_roll_open_idx
  on core.fabric_reservations (organization_id, roll_id)
  where status in ('active', 'partially_consumed');

create index reservations_project_idx
  on core.fabric_reservations (organization_id, project_id);

create index usage_reservation_idx
  on core.fabric_usage (organization_id, reservation_id);

create index rolls_variant_idx
  on core.fabric_rolls (organization_id, variant_id)
  where retired_at is null;

create index variants_product_idx
  on core.fabric_variants (organization_id, product_id)
  where archived_at is null;

-- ── العروض ──────────────────────────────────────────────────────────────────
create index quotations_project_idx
  on core.quotations (organization_id, project_id);

create index versions_quotation_idx
  on core.quotation_versions (organization_id, quotation_id, version_number desc);

create index items_version_idx
  on core.quotation_items (organization_id, version_id, sort_order);

-- طابور موافقات الأدمن
create index discount_requests_pending_idx
  on core.discount_requests (organization_id, created_at desc)
  where status = 'pending';

-- ── الإنتاج والميدان ────────────────────────────────────────────────────────
create index tailor_assignments_tailor_idx
  on core.tailor_assignments (organization_id, tailor_id, stage);

create index field_visits_assignee_idx
  on core.field_visits (organization_id, assignee_id, scheduled_at);

create index field_visits_project_idx
  on core.field_visits (organization_id, project_id);

-- ── المال والمرفقات ─────────────────────────────────────────────────────────
create index payments_project_idx
  on core.payments (organization_id, project_id, created_at desc);

create index attachments_project_idx
  on core.attachments (organization_id, project_id, created_at desc);

-- ── الإشعارات والتدقيق ──────────────────────────────────────────────────────
-- من sql.html حرفيا
create index notifications_unread_idx
  on core.notifications (user_id, read_at)
  where read_at is null;

create index audit_logs_org_created_idx
  on core.audit_logs (organization_id, created_at desc);

create index audit_logs_entity_idx
  on core.audit_logs (organization_id, entity, entity_id);

create index client_operations_user_state_idx
  on core.client_operations (organization_id, user_id, state)
  where state <> 'synced';
