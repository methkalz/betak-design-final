-- ============================================================================
-- بيتك ديزاين — 0028 — فرض ما تبقى من invariants المحاسبة على المحرّك
-- مراجعة كود ثانية وجدت قيدَي سلامة موثَّقين لكن غير مفروضين. تحقق حي قبل
-- الكتابة: كلا الجدولين فارغ، فالقيود تُتحقق فورًا بلا backfill.
--
-- 1) overconsumption معرَّفة تصميميًا كزيادة عن حجز بعينه، والـRPC يضع
--    reservation_id فعلًا — لكن قيد reservation_required لم يشملها. إدخال من
--    ترحيل أو دور مرتفع أو كود مستقبلي خاطئ كان يستطيع كتابة زيادة يتيمة
--    بلا حجز. القيد الآن يطابق التعريف.
--
-- 2) معادلة fabric_usage الرسمية (actual = planned + waste) كانت التزامًا في
--    كود الـRPC وحده. الأعمدة numeric(12,3) فالجمع دقيق تمامًا — مساواة
--    مباشرة بلا round (التقريب يلزم فقط لو كانت الأعمدة float أو بدقة أوسع
--    من مدخلاتها، وليست كذلك).
-- ============================================================================

alter table core.stock_movements drop constraint reservation_required;
alter table core.stock_movements add constraint reservation_required
  check (
    type not in ('reservation', 'reservation_release', 'consumption', 'overconsumption')
    or reservation_id is not null
  );

comment on constraint reservation_required on core.stock_movements is
  'الحجز وفكّه والاستهلاك والزيادة عن الحجز لا معنى لها بلا حجز مرجعي. '
  'damage_reserved تُضاف هنا عند اعتمادها.';

alter table core.fabric_usage add constraint usage_actual_equals_planned_plus_waste
  check (actual_m = planned_m + waste_m);

comment on constraint usage_actual_equals_planned_plus_waste on core.fabric_usage is
  'المعادلة الرسمية للصف-كحدث: actual = planned (المغطى بالحجز) + waste (الزيادة). '
  'مساواة دقيقة — الأعمدة numeric(12,3) والجمع عليها exact.';
