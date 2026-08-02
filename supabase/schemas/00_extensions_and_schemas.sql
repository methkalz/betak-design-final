-- ════════════════════════════════════════════════════════════════════
-- الامتدادات والسكيمات
-- أول ملف يُنفَّذ. كل ما بعده يعتمد عليه.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

create schema if not exists core;
create schema if not exists private;
create schema if not exists api;

comment on schema core is
  'الجداول الأصلية. لا تعرض للعملاء إطلاقا — الوصول عبر api فقط.';
comment on schema private is
  'دوال الصلاحيات. authenticated يملك EXECUTE (تحتاجه سياسات RLS)، والحماية '
  'أن السكيما غير معروضة في PGRST_DB_SCHEMAS فلا تُنادى من الواجهة.';
comment on schema api is
  'سطح الـAPI. رموز أخطاء الدوال: '
  'BD400 مدخلات غير صالحة أو مفتاح idempotency مُعاد ببصمة مختلفة · '
  'BD403 صلاحية مرفوضة · BD404 غير موجود · '
  'BD409 تعارض حالة أو نسخة (لا يُعاد تلقائيًا) · BD422 رصيد غير كافٍ.';
