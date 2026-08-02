-- ============================================================================
-- بيتك ديزاين — 0015 — تقسية قبل طبقة RPC
-- استجابة لمراجعة مهنية. كل بند هنا تحقّقنا منه على المحرّك لا نظريًا.
-- ============================================================================

-- ── 1) نزع USAGE على core ───────────────────────────────────────────────────
-- تحقق تجريبي على هذه القاعدة:
--   • قراءة وكتابة عبر views بـsecurity_invoker: تعملان بعد النزع.
--   • select from core.customers مباشرة: 42501 permission denied for schema core.
-- السبب: مرجع الجدول الأساسي داخل الview محلول إلى OID وقت الإنشاء، فلا يُعاد
-- فحص USAGE على السكيما. أما المرجع بالاسم في استعلام مباشر فيُفحص.
-- المحصلة: صلاحيات الجداول تبقى (يحتاجها security_invoker)، ويسقط أي مسار
-- مباشر إلى core حتى لو عُرضت يومًا لـPostgREST بالخطأ.
revoke usage on schema core from authenticated;

-- ── 2) لا DELETE حيث الأرشفة هي القاعدة ─────────────────────────────────────
-- الـtrigger يمنع الحذف أصلًا، لكن غياب المنح خط دفاع أسبق منه.
revoke delete on core.customers from authenticated;
revoke delete on core.projects  from authenticated;
revoke delete on api.customers  from authenticated;
revoke delete on api.projects   from authenticated;

-- ── 3) بصمة الطلب للـidempotency ────────────────────────────────────────────
-- تفرد المفتاح وحده لا يكفي: مفتاح مُعاد بمدخلات مختلفة يجب أن يُرفض، لا أن
-- يُعيد النتيجة القديمة صامتًا.
alter table core.client_operations add column if not exists payload jsonb;

comment on column core.client_operations.payload is
  'بصمة مدخلات الطلب. إعادة استخدام المفتاح ببصمة مختلفة تُرفض بـBD400.';

-- ── 4) دور محدود الصلاحية يملك دوال RPC ─────────────────────────────────────
-- بدل ملكية postgres (الذي يملك كل شيء على كل شيء). الدور هنا:
--   • nologin — لا أحد يتصل به.
--   • bypassrls — لازم: FORCE ROW LEVEL SECURITY يشمل المالك، وسياساتنا كلها
--     ‎to authenticated‎ فلا سياسة تمنحه شيئًا. البديل كتابة سياسات له على 28
--     جدولًا، وهو أوسع سطحًا لا أضيق.
--   • صلاحيات جدولية محددة بالاسم — هذا هو الحد الحقيقي: BYPASSRLS يتجاوز
--     الصفوف، لكنه لا يخلق صلاحية على جدول لم يُمنح عليه شيء.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'baytak_rpc_owner') then
    create role baytak_rpc_owner nologin bypassrls;
  end if;
end $$;

comment on role baytak_rpc_owner is
  'مالك دوال api الحساسة. لا يسجّل دخولًا، ولا يملك إلا الجداول الممنوحة أدناه.';

grant usage on schema core, private, api to baytak_rpc_owner;

-- قراءة: ما تحتاجه الدوال للتحقق والحساب
grant select on
  core.organization_members, core.organizations, core.business_settings,
  core.projects, core.project_statuses, core.customers,
  core.fabric_rolls, core.fabric_variants, core.fabric_products,
  core.stock_movements, core.fabric_reservations, core.fabric_usage,
  core.quotations, core.quotation_versions, core.quotation_items,
  core.discount_requests, core.payments, core.pricing_rules,
  core.windows, core.rooms, core.client_operations
to baytak_rpc_owner;

-- كتابة: دفاتر الأستاذ إدراج فقط — لا UPDATE ولا DELETE، والـtriggers تؤكد ذلك
grant insert on
  core.stock_movements, core.audit_logs, core.payments, core.notifications
to baytak_rpc_owner;

grant insert, update on
  core.fabric_reservations, core.fabric_usage, core.client_operations,
  core.quotations, core.quotation_versions, core.quotation_items,
  core.discount_requests
to baytak_rpc_owner;

grant update on core.projects to baytak_rpc_owner;

grant execute on all functions in schema private to baytak_rpc_owner;
alter default privileges in schema private
  grant execute on functions to baytak_rpc_owner;

-- الدور صراحةً بلا صلاحية على المفاتيح والأدوار
revoke all on core.profiles, core.organization_members from baytak_rpc_owner;
grant select on core.profiles, core.organization_members to baytak_rpc_owner;

-- ── 5) رموز أخطاء موحّدة ────────────────────────────────────────────────────
-- تُترجم في الواجهة إلى رسائل عربية، ويميّزها العميل عن أعطال الشبكة فلا يعيد
-- المحاولة تلقائيًا على تعارض تحرير.
comment on schema api is
  'سطح الـAPI. رموز أخطاء الدوال: '
  'BD400 مدخلات غير صالحة أو مفتاح idempotency مُعاد ببصمة مختلفة · '
  'BD403 صلاحية مرفوضة · BD404 غير موجود · '
  'BD409 تعارض حالة أو نسخة (لا يُعاد تلقائيًا) · BD422 رصيد غير كافٍ.';
