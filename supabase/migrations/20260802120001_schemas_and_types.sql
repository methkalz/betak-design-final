-- ============================================================================
-- بيتك ديزاين — 0001 — السكيمات والأنواع
-- المرجع: دليل الفريق → database.html, sql.html, security.html
--
-- قواعد ملزمة مطبقة في كل ملفات الترحيل:
--   • المال يخزن بالأغورة في bigint — لا floats إطلاقا.
--   • الأمتار numeric(12,3)، السنتيمترات numeric(10,2).
--   • كل جدول تجاري يحمل organization_id.
--   • المفاتيح الخارجية الحساسة مركبة (organization_id, id) لمنع تسرب
--     الصفوف بين المؤسسات حتى لو أخطأت سياسة RLS.
--   • لا حذف فعلي للبيانات المهمة — أرشفة أو قيد عكسي.
--
-- يتطلب PostgreSQL 15 فأحدث: المخطط يستخدم
-- «on delete set null (column_list)» وهي ميزة أضيفت في الإصدار 15.
-- ============================================================================

create extension if not exists pgcrypto;

-- ── السكيمات ────────────────────────────────────────────────────────────────
create schema if not exists core;
create schema if not exists private;
create schema if not exists api;

comment on schema core is
  'الجداول الأصلية. لا تعرض للعملاء إطلاقا — الوصول عبر api فقط.';
comment on schema private is
  'دوال الصلاحيات والمساعدة. security definer مع search_path فارغ وبلا EXECUTE للعملاء.';
comment on schema api is
  'سطح الـAPI: Views وRPCs. هذا هو الشيء الوحيد الذي يراه التطبيق.';

-- التطبيق يصل إلى قاعدة البيانات عبر سكيما api وحدها.
revoke all on schema core    from anon, authenticated;
revoke all on schema private from anon, authenticated;
grant usage on schema api to authenticated;

-- ── الأدوار ─────────────────────────────────────────────────────────────────
create type core.app_role as enum ('admin', 'sales', 'field', 'tailor');

-- ── المشاريع ────────────────────────────────────────────────────────────────
create type core.priority as enum ('low', 'normal', 'high');

-- ── الشبابيك ────────────────────────────────────────────────────────────────
create type core.curtain_model as enum
  ('wave', 'pinch_pleat', 'eyelet', 'roman', 'sheer_panel');

create type core.track_type as enum
  ('ceiling_rail', 'wall_rod', 'motorized', 'double_rail');

-- ── الأقمشة والمخزون ────────────────────────────────────────────────────────
create type core.fabric_kind as enum ('crepe', 'other', 'lining');

create type core.movement_type as enum (
  'receipt',
  'reservation',
  'reservation_release',
  'consumption',
  'return',
  'damage',
  'adjustment_in',
  'adjustment_out',
  'transfer_in',
  'transfer_out'
);

create type core.reservation_status as enum
  ('active', 'partially_consumed', 'consumed', 'released');

-- ── التسعير ─────────────────────────────────────────────────────────────────
create type core.height_band as enum ('standard', 'tall');

create type core.pricing_category as enum (
  'crepe_with_lining',
  'crepe_without_lining',
  'other_without_lining',
  'other_with_lining'
);

-- ── العروض والخصومات ────────────────────────────────────────────────────────
create type core.quotation_status as enum
  ('draft', 'sent', 'approved', 'rejected', 'expired');

create type core.discount_request_status as enum
  ('pending', 'approved', 'rejected');

-- ── الإنتاج والميدان ────────────────────────────────────────────────────────
create type core.tailor_stage as enum
  ('received', 'cutting', 'sewing', 'ironing', 'qc', 'ready');

create type core.visit_type as enum ('measurement', 'installation');

create type core.visit_status as enum ('scheduled', 'in_progress', 'completed');

-- ── المال ───────────────────────────────────────────────────────────────────
create type core.payment_method as enum ('cash', 'transfer', 'check', 'card');

create type core.payment_kind as enum
  ('deposit', 'milestone', 'final', 'reversal');

-- ── الملفات والإشعارات ──────────────────────────────────────────────────────
create type core.attachment_kind as enum
  ('measurement', 'before_install', 'after_install', 'fabric', 'document');

create type core.notification_kind as enum (
  'discount_request',
  'tailor_assignment',
  'visit_assigned',
  'ready_for_install',
  'appointment_tomorrow',
  'sync_failed',
  'low_stock',
  'payment'
);

-- ── المزامنة ────────────────────────────────────────────────────────────────
create type core.sync_state as enum
  ('saved_local', 'pending', 'syncing', 'synced', 'failed', 'needs_review');
