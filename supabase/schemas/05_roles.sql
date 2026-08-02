-- ════════════════════════════════════════════════════════════════════
-- الأدوار
--
-- ⚠️ الأدوار كائنات على مستوى العنقود لا القاعدة، و`supabase db diff`
-- لا يولّدها. هذا الملف **توثيقي ومرجعي** — الإنشاء الفعلي تم في
-- الترحيل 20260802120015_hardening.sql ويجب أن يبقى هناك.
--
-- لا تنقل هذا المحتوى إلى migration جديدة؛ الترحيل القائم منشور بالفعل.
-- ════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'baytak_rpc_owner') then
    -- nologin    : لا أحد يتصل بهذا الدور.
    -- bypassrls  : لازم لأن FORCE ROW LEVEL SECURITY يشمل المالك، وكل سياساتنا
    --              ‎to authenticated‎ فلا سياسة تمنحه شيئًا. الحدّ الحقيقي هو
    --              الصلاحيات الجدولية المسمّاة: تجاوز الصفوف لا يخلق صلاحية
    --              على جدول لم يُمنح عليه شيء.
    create role baytak_rpc_owner nologin bypassrls;
  end if;
end $$;

comment on role baytak_rpc_owner is
  'مالك دوال api الحساسة. nologin. يملك: قراءة/كتابة محددة على core، '
  'تنفيذ دوال private، و USAGE على auth مع auth.uid() فقط — لا جداول auth.';

-- ⚠️ عضوية postgres في هذا الدور لازمة لـALTER … OWNER TO، وتُكتب بالاسم
-- الصريح لا بـCURRENT_USER — انظر KNOWN_ISSUES.md § BD-ENV-001.
--     grant baytak_rpc_owner to postgres;   ← في migration، لا هنا
