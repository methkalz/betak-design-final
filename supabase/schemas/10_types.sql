-- ════════════════════════════════════════════════════════════════════
-- أنواع enum (19)
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE TYPE core.app_role AS ENUM (
    'admin',
    'sales',
    'field',
    'tailor'
);

CREATE TYPE core.attachment_kind AS ENUM (
    'measurement',
    'before_install',
    'after_install',
    'fabric',
    'document'
);

CREATE TYPE core.curtain_model AS ENUM (
    'wave',
    'pinch_pleat',
    'eyelet',
    'roman',
    'sheer_panel'
);

CREATE TYPE core.discount_request_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);

CREATE TYPE core.fabric_kind AS ENUM (
    'crepe',
    'other',
    'lining'
);

CREATE TYPE core.height_band AS ENUM (
    'standard',
    'tall'
);

CREATE TYPE core.movement_type AS ENUM (
    'receipt',
    'reservation',
    'reservation_release',
    'consumption',
    'overconsumption',
    'return',
    'damage',
    'damage_reserved',
    'adjustment_in',
    'adjustment_out',
    'transfer_in',
    'transfer_out'
);

CREATE TYPE core.notification_kind AS ENUM (
    'discount_request',
    'tailor_assignment',
    'visit_assigned',
    'ready_for_install',
    'appointment_tomorrow',
    'sync_failed',
    'low_stock',
    'payment'
);

CREATE TYPE core.payment_kind AS ENUM (
    'deposit',
    'milestone',
    'final',
    'reversal'
);

CREATE TYPE core.payment_method AS ENUM (
    'cash',
    'transfer',
    'check',
    'card'
);

CREATE TYPE core.pricing_category AS ENUM (
    'crepe_with_lining',
    'crepe_without_lining',
    'other_without_lining',
    'other_with_lining'
);

CREATE TYPE core.priority AS ENUM (
    'low',
    'normal',
    'high'
);

CREATE TYPE core.quotation_status AS ENUM (
    'draft',
    'sent',
    'approved',
    'rejected',
    'expired',
    'superseded'
);

CREATE TYPE core.reservation_status AS ENUM (
    'active',
    'partially_consumed',
    'consumed',
    'released',
    'closed'
);

CREATE TYPE core.sync_state AS ENUM (
    'saved_local',
    'pending',
    'syncing',
    'synced',
    'failed',
    'needs_review'
);

CREATE TYPE core.tailor_stage AS ENUM (
    'received',
    'cutting',
    'sewing',
    'ironing',
    'qc',
    'ready'
);

CREATE TYPE core.track_type AS ENUM (
    'ceiling_rail',
    'wall_rod',
    'motorized',
    'double_rail'
);

CREATE TYPE core.visit_status AS ENUM (
    'scheduled',
    'in_progress',
    'completed'
);

CREATE TYPE core.visit_type AS ENUM (
    'measurement',
    'installation'
);
