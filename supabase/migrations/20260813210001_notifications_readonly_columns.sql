-- ════════════════════════════════════════════════════════════════════
-- علامة القراءة عمود وحيد قابل للتحديث
--
-- سطح mark-read مباشر عمدًا (فلاغ ذاتي حميد idempotent، وRLS يقصره على
-- صفوف صاحبه) - لكن منحة UPDATE كانت تشمل كل الأعمدة، فيستطيع المستخدم
-- نظريًا إعادة كتابة عنوان إشعاره أو رابطه العميق عبر PostgREST.
-- تُقصَر المنحة على read_at في العرض والجدول معًا: security_invoker
-- يفحص صلاحيات المستدعي على الاثنين.
-- ════════════════════════════════════════════════════════════════════

revoke update on core.notifications from authenticated;
grant update (read_at) on core.notifications to authenticated;

revoke update on api.notifications from authenticated;
grant update (read_at) on api.notifications to authenticated;

notify pgrst, 'reload schema';
