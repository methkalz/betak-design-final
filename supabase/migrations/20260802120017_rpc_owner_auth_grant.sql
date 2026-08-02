-- ============================================================================
-- ⚠️ هذا الترحيل لم يحقق غرضه — يبطله 0018. أُبقي للسجل التاريخي.
--
-- سكيما auth مملوكة لـsupabase_admin، و postgres يحمل USAGE عليها **بلا
-- GRANT OPTION**. فالمنح أدناه يصدر:
--     WARNING: no privileges were granted for "auth"
-- تحذيرًا لا خطأً، فيمر الترحيل بنجاح ظاهري بلا أي أثر. الحل في 0018:
-- إزالة الاعتماد على سكيما auth بدل محاولة انتزاع صلاحية منها.
-- ============================================================================

-- ============================================================================
-- بيتك ديزاين — 0017 — وصول مالك الـRPC إلى auth.uid()
--
-- العطل: الترحيل 0015 منح baytak_rpc_owner صلاحية USAGE على core و private و
-- api فقط. لكن كل دالة RPC تبدأ بـ auth.uid() لتعرف من المستدعي، وهي في سكيما
-- auth. النتيجة عند أول نداء:
--
--     ERROR 42501: permission denied for schema auth
--     QUERY: v_uid := (select auth.uid())
--
-- وبما أن الدالة security definer تنفَّذ بصلاحيات مالكها، فقد كانت كل دوال RPC
-- معطّلة كليًا. لم يظهر هذا عند الإنشاء — الأخطاء التنفيذية لا تُكتشف بالترحيل.
--
-- المنح ضيق عمدًا: USAGE على السكيما و EXECUTE على دالتَي الهوية وحدهما،
-- لا وصول إلى auth.users ولا إلى جداول الجلسات والرموز.
-- ============================================================================

grant usage on schema auth to baytak_rpc_owner;
grant execute on function auth.uid()  to baytak_rpc_owner;
grant execute on function auth.role() to baytak_rpc_owner;

-- تأكيد صريح: لا وصول إلى بيانات المصادقة نفسها
revoke all on all tables in schema auth from baytak_rpc_owner;

comment on role baytak_rpc_owner is
  'مالك دوال api الحساسة. nologin. يملك: قراءة/كتابة محددة على core، '
  'تنفيذ دوال private، و USAGE على auth مع auth.uid() فقط — لا جداول auth.';
