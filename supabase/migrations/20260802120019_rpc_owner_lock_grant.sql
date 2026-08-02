-- ============================================================================
-- بيتك ديزاين — 0019 — صلاحية القفل على الرولات
--
-- العطل: SELECT … FOR UPDATE يتطلب صلاحية UPDATE على الجدول، لا SELECT فقط —
-- حتى حين لا نعدّل الصف إطلاقًا ونكتفي بقفله. (FOR SHARE يكفيه SELECT، لكنه
-- لا يسلسل: قفلان مشتركان يتعايشان، فينهار الغرض كله.)
--
--     ERROR: permission denied for table fabric_rolls
--     CONTEXT: SELECT 1 from core.fabric_rolls where id = p_roll_id for update
--
-- 0015 منح baytak_rpc_owner صلاحية SELECT على fabric_rolls فقط.
--
-- المنح آمن: الدور nologin، ولا تُنفَّذ به إلا دوالنا. والحاجة ستتكرر لاحقًا
-- (إخراج رول من الخدمة، إنشاء Mini Roll من البقايا).
-- ============================================================================

grant update on core.fabric_rolls to baytak_rpc_owner;

comment on function api.reserve_fabric(uuid, uuid, numeric, uuid, integer) is
  'حجز قماش لمشروع. المؤسسة تُشتق من المشروع لا من الجهاز. '
  'SELECT … FOR UPDATE على صف الرول يسلسل الحجوزات المتزامنة. '
  'idempotency: نفس المفتاح يعيد النتيجة، ونفس المفتاح ببصمة مختلفة يُرفض. '
  'الأخطاء: BD400 مدخلات · BD403 صلاحية · BD404 غير موجود · '
  'BD409 حالة أو نسخة · BD422 رصيد غير كافٍ.';
