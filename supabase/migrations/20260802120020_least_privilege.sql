-- ============================================================================
-- بيتك ديزاين — 0020 — أقل صلاحية لمالك الـRPC
-- استجابة لمراجعة مهنية، بعد تحقق تجريبي من كل بند.
-- ============================================================================

-- ── 1) سحب CREATE بعد نقل الملكية ───────────────────────────────────────────
-- مُنحت في 0016 لأن ALTER … OWNER TO تشترطها. الملكية لا تزول بسحبها، والدور
-- يفقد قدرته على إنشاء كائنات جديدة في api لو أُسيء استخدامه يومًا.
-- إعادة منحها مؤقتًا لازمة عند كل ALTER … OWNER لدالة جديدة، ثم تُسحب.
revoke create on schema api from baytak_rpc_owner;

-- ── 2) قفل الرول بصلاحية عمود واحد بدل الجدول ───────────────────────────────
-- تحقق تجريبي على هذه القاعدة: منح UPDATE على عمود واحد يكفي تمامًا لـ
-- SELECT … FOR UPDATE (النتيجة: COLUMN-LEVEL UPDATE IS ENOUGH).
-- fabric_rolls بلا lock_version، فاخترنا retired_at: عمود يحتاجه فعلًا أي
-- RPC مستقبلي لإخراج رول من الخدمة، ولا يمكن أن يفسد رصيدًا — الأرصدة تُشتق
-- من دفتر الحركة لا من صف الرول.
revoke update on core.fabric_rolls from baytak_rpc_owner;
grant  update (retired_at) on core.fabric_rolls to baytak_rpc_owner;

comment on table core.fabric_rolls is
  'الرول قطعة مادية بلا عمود رصيد. مالك الـRPC يملك UPDATE على retired_at '
  'وحده — يكفي لـ SELECT … FOR UPDATE ولا يسمح بتعديل الكود أو الموقع أو الدفعة.';

-- ── 3) تثبيت دلالات الهوية ──────────────────────────────────────────────────
-- تحقق تجريبي بـJWT حقيقي عبر Kong → PostgREST على هذا الستاك:
--     request.jwt.claim.sub  →  NULL   (المفتاح المفرد غير مضبوط إطلاقًا)
--     request.jwt.claims     →  JSON كامل يحوي sub
-- لذا قراءة المفتاح المفرد وحده تُرجع NULL لكل طلب حقيقي وتُفشل كل RPC.
-- الرجوع إلى الـJSON ليس احتياطًا تجميليًا بل المسار العامل الوحيد.
comment on function private.current_uid() is
  'هوية المستدعي من الـJWT. مُثبَت تجريبيًا أن PostgREST يضبط request.jwt.claims '
  '(JSON) بينما request.jwt.claim.sub يبقى NULL — فلا تحذف الرجوع إلى الـJSON. '
  'تُرجع NULL خارج سياق JWT، وكل RPC ترفض NULL بـBD403.';

-- anon لا ينادي دوال الهوية
revoke all on function private.current_uid() from anon, public;
grant execute on function private.current_uid() to authenticated, baytak_rpc_owner;
