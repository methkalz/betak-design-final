-- ============================================================================
-- منحة USAGE على سكيما extensions لمالك دوال RPC
--
-- البصمة القانونية fp1 (private.version_content_fingerprint) تستدعي
-- extensions.digest، وهي دالة SQL عادية (غير definer) تعمل بصلاحيات
-- المستدعي — وداخل دوال api المملوكة لـbaytak_rpc_owner يكون المستدعي هو
-- المالك نفسه، الذي لم يكن يملك USAGE على السكيما فرفضت أول بصمة إرسال:
-- «permission denied for schema extensions» (اكتشفت بمجموعة quotation_rpcs
-- قبل أي دمج — البوابة عملت).
-- ============================================================================

grant usage on schema extensions to baytak_rpc_owner;
grant execute on function extensions.digest(text, text) to baytak_rpc_owner;
