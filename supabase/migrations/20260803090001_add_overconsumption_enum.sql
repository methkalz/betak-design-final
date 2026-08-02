-- ============================================================================
-- بيتك ديزاين — 0025 — إضافة قيمة overconsumption إلى movement_type
--
-- لماذا ملف مستقل: القاعدة تمنع استخدام قيمة enum جديدة داخل نفس المعاملة
-- التي أضافتها («unsafe use of new value»)، وكل ترحيلاتنا تُطبَّق بـ
-- --single-transaction. فالإضافة هنا، والاستخدام في الترحيل التالي.
--
-- سياسة الـenum (انظر DECISIONS.md §8): قيم movement_type تُضاف ولا يُعاد
-- تسميتها ولا تُحذف — حذف قيمة enum في PostgreSQL شبه مستحيل عمليًا.
--
-- المعنى المحاسبي:
--   consumption      استهلاك مغطّى بحجز:   on_hand ↓  reserved ↓  available ثابت
--   overconsumption  استهلاك يتجاوز الحجز: on_hand ↓  reserved ثابت  available ↓
--
-- كانت الزيادة تُسجَّل adjustment_out — فتختلط بتصحيحات الجرد وتفسد تقارير
-- الهدر. الحركتان تُربطان بـ operation_group_id (الترحيل التالي).
-- ============================================================================

alter type core.movement_type add value if not exists 'overconsumption' after 'consumption';
