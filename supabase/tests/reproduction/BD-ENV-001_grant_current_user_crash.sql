-- ============================================================================
-- ⚠️⚠️  إعادة إنتاج عطل — لا تُشغَّل على قاعدة إنتاج.  ⚠️⚠️
--
-- BD-ENV-001: GRANT role TO CURRENT_USER يُسقط خادم PostgreSQL بالكامل.
-- انظر KNOWN_ISSUES.md
--
-- هذا الملف **ليس ترحيلًا** ولا يجوز نقله إلى supabase/migrations/.
-- غرضه الوحيد: التحقق مما إذا كان العطل قد زال بعد ترقية البيئة.
--
-- البيئة التي رُصد فيها (2026-08-02):
--     supabase/postgres:15.8.1.085 · PostgreSQL 15.8 · Coolify 4.1.2
--
-- الأثر المتوقع عند بقاء العطل:
--     server closed the connection unexpectedly
--     the database system is in recovery mode
-- الاسترداد تلقائي من WAL خلال ثوانٍ وبلا فقد بيانات — لكنه انقطاع خدمة كامل
-- لكل الحاويات المتصلة.
--
-- طريقة الاستخدام الآمنة:
--   1. نسخة تطوير معزولة، أو نافذة صيانة معلنة.
--   2. شغّل، ثم راقب: docker logs <db> | grep 'recovery mode'
--   3. سجّل النتيجة في KNOWN_ISSUES.md مع رقم إصدار البيئة الجديد.
-- ============================================================================

-- الحالة قبل المحاولة
select current_setting('server_version') as pg_version;
select rolname, rolsuper, rolcreaterole from pg_roles where rolname = current_user;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'bd_env_001_probe') then
    create role bd_env_001_probe nologin;
  end if;
end $$;

select pg_has_role(current_user, 'bd_env_001_probe', 'member') as member_before;

-- ── العبارة القاتلة ─────────────────────────────────────────────────────────
-- إن نجت الجلسة، فالعطل زال في هذه البيئة.
grant bd_env_001_probe to current_user;

select 'SURVIVED — BD-ENV-001 appears fixed in this environment' as verdict;
select pg_has_role(current_user, 'bd_env_001_probe', 'member') as member_after;

drop role if exists bd_env_001_probe;
