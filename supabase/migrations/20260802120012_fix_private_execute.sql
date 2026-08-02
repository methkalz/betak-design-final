-- ============================================================================
-- بيتك ديزاين — 0012 — تصحيح حاجب: صلاحية تنفيذ دوال private
--
-- العطل: الترحيل 0010 نزع كل صلاحيات سكيما private عن authenticated بنية
-- «الدفاع في العمق». لكن بوستجرس يقيّم تعبيرات سياسات RLS **بصلاحيات الدور
-- المستعلِم**، وكل سياسة عندنا تنادي private.is_org_member أو
-- private.can_see_project. النتيجة كانت:
--
--     ERROR 42501: permission denied for schema private
--
-- على كل استعلام لأي مستخدم مصادَق عليه. أي أن القاعدة كانت معطّلة كليًا،
-- ولم يظهر ذلك لأن الاختبار الأول جرى بدور postgres الذي يتجاوز RLS أصلًا.
--
-- الحدّ الأمني الصحيح ليس نزع EXECUTE، بل **عدم عرض سكيما private لـPostgREST**:
-- PGRST_DB_SCHEMAS = public,storage,graphql_public,api — فـprivate غير قابلة
-- للنداء عبر الواجهة مهما كانت صلاحية التنفيذ.
--
-- والدوال نفسها لا تسرّب شيئًا: كلها تجيب عن «ما صلاحيتي أنا؟» ولا تقبل
-- معرّف مستخدم آخر — تقرأ auth.uid() داخليًا.
-- ============================================================================

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- أي دالة private تُضاف لاحقًا تحصل على الصلاحية تلقائيًا، وإلا انكسرت
-- السياسات التي تستعملها بصمت.
alter default privileges in schema private
  grant execute on functions to authenticated;

-- anon لا سياسة تخصه: كل سياساتنا ‎to authenticated‎.
revoke all on schema private from anon;
revoke all on all functions in schema private from anon;

comment on schema private is
  'دوال الصلاحيات. authenticated يملك EXECUTE (تحتاجه سياسات RLS)، والحماية '
  'أن السكيما غير معروضة في PGRST_DB_SCHEMAS فلا تُنادى من الواجهة.';
