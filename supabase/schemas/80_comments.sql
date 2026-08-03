-- ════════════════════════════════════════════════════════════════════
-- التعليقات (62)
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

COMMENT ON SCHEMA core IS 'الجداول الأصلية. لا تعرض للعملاء إطلاقا — الوصول عبر api فقط.';
COMMENT ON TABLE core.attachments IS 'الصف ينشأ بعد نجاح الرفع فقط. قبل ذلك الصورة في طابور الرفع على الجهاز.';
COMMENT ON COLUMN core.attachments.storage_path IS 'المسار يبدأ بـ organization_id/ وتتحقق منه سياسات storage.objects.';
COMMENT ON TABLE core.audit_logs IS 'غير قابل للتعديل. أي عملية مال أو مخزون أو خصم أو حالة رسمية تكتب صفا هنا.';
COMMENT ON COLUMN core.audit_logs.actor_id IS 'يسمح بأن يكون null: العملية قد تنفذ من نظام أو مهمة مجدولة لا من مستخدم.';
COMMENT ON TABLE core.profiles IS 'بيانات المستخدم العامة. المفتاح هو auth.users.id — لا كلمات سر ولا PIN هنا.';
COMMENT ON COLUMN core.business_settings.vat_percent IS 'نسبة ض.ق.م. مصدر الحقيقة الوحيد — لا تكرر على core.organizations.';
COMMENT ON COLUMN core.business_settings.timezone IS 'المنطقة الزمنية للمؤسسة (اسم IANA). تُستعمل لاشتقاق سنة ترقيم المستندات؛ اسم غير صالح يُفشل عملية الترقيم بخطأ صريح من at time zone.';
COMMENT ON TABLE core.client_operations IS 'دفتر الـidempotency. يقرأ في مستهل كل RPC حساس قبل تنفيذ أي أثر جانبي.';
COMMENT ON COLUMN core.client_operations.result IS 'يعاد حرفيا عند تكرار نفس idempotency_key بدل إعادة تنفيذ العملية.';
COMMENT ON COLUMN core.client_operations.payload IS 'بصمة مدخلات الطلب. إعادة استخدام المفتاح ببصمة مختلفة تُرفض بـBD400.';
COMMENT ON COLUMN core.customers.archived_at IS 'الأرشفة تحل محل الحذف. لا DELETE على هذا الجدول في أي RPC.';
COMMENT ON TABLE core.payments IS 'جدول مالي. لا UPDATE ولا DELETE — الرصيد = Σ amount_agorot بما فيه العكسيات.';
COMMENT ON CONSTRAINT reversal_shape ON core.payments IS 'يمنع دفعة عادية بمبلغ سالب، ويمنع قيدا عكسيا يتيما بلا أصل.';
COMMENT ON COLUMN core.projects.field_worker_id IS 'الربط المركب يضمن أن العامل المعين عضو في المؤسسة نفسها.';
COMMENT ON COLUMN core.projects.lock_version IS 'قفل تفاؤلي. يرفض RPC الكتابة إذا تغيرت النسخة — يمنع الكتابة فوق تعديل غيرك.';
COMMENT ON TABLE core.discount_requests IS 'الحد الأعلى المسموح يقرأ من business_settings — لا يثبت في قيد جدول.';
COMMENT ON COLUMN core.fabric_products.kind IS 'يحدد فئة التسعير: crepe مقابل other. lining يعامل كبطانة لا كقماش رئيسي.';
COMMENT ON TABLE core.fabric_reservations IS 'الحجز يمسك القماش دون إخراجه: available = on_hand − reserved.';
COMMENT ON COLUMN core.fabric_reservations.quantity_m IS 'المحجوز الأصلي — ثابت لا يُنقص. الإنقاص يتم عبر consumed_m و released_m.';
COMMENT ON COLUMN core.fabric_reservations.released_at IS 'وقت التحرير الكامل النقي فقط (status = released). الإغلاق المختلط أو بالتلف لا يمسّه — انظر finalized_at.';
COMMENT ON COLUMN core.fabric_reservations.released_m IS 'المحرَّر تراكميًا. الـinvariant: quantity_m = consumed_m + released_m + remaining.';
COMMENT ON COLUMN core.fabric_reservations.damaged_reserved_m IS 'ما تلف من الكمية المحجوزة. يدخل في الـinvariant: quantity_m = consumed_m + released_m + damaged_reserved_m + remaining.';
COMMENT ON COLUMN core.fabric_reservations.finalized_at IS 'وقت دخول أي حالة نهائية (consumed / released / closed). يُختم مرة واحدة.';
COMMENT ON CONSTRAINT reservation_balance_invariant ON core.fabric_reservations IS 'يفرض على المحرك: reserved_initial = consumed + released + damaged + remaining.';
COMMENT ON TABLE core.fabric_rolls IS 'الرول قطعة مادية بلا عمود رصيد. مالك الـRPC يملك UPDATE على retired_at وحده — يكفي لـ SELECT … FOR UPDATE ولا يسمح بتعديل الكود أو الموقع أو الدفعة.';
COMMENT ON COLUMN core.fabric_rolls.dye_lot IS 'دفعة الصبغ. اختلافها بين رولين مشروع واحد يوجب تحذيرا للمستخدم.';
COMMENT ON COLUMN core.fabric_rolls.initial_meters IS 'الطول عند الاستلام، للتوثيق فقط. الرصيد الحالي يحسب من سجل الحركة.';
COMMENT ON COLUMN core.fabric_variants.cost_per_meter_agorot IS 'حساس: تكلفة الجملة. يمنع ظهوره في أي view للأدوار field أو tailor.';
COMMENT ON TABLE core.fabric_usage IS 'الفارق بين المخطط والفعلي. تجاوز الخطة يستوجب سببا ويولد إشعارا للأدمن.';
COMMENT ON COLUMN core.fabric_usage.planned_m IS 'لكل حدث استهلاك: الجزء المغطى بالحجز (لا «المتبقي قبل العملية»). actual_m = planned_m + waste_m لكل صف، و Σ(planned_m) ≤ quantity_m للحجز.';
COMMENT ON CONSTRAINT usage_actual_equals_planned_plus_waste ON core.fabric_usage IS 'المعادلة الرسمية للصف-كحدث: actual = planned (المغطى بالحجز) + waste (الزيادة). مساواة دقيقة — الأعمدة numeric(12,3) والجمع عليها exact.';
COMMENT ON TABLE core.movement_reasons IS 'الأسباب المعتمدة لحركات المخزون. الوجود يفرضه FK من stock_movements؛ الفاعلية (is_active) والنطاق (applies_to) يفرضهما محفّز enforce_reason_scope على الدفتر + فحص الدوال — على المحرّك لا بالاتفاق.';
COMMENT ON TABLE core.field_visits IS 'العامل الميداني يرى زياراته فقط — سياسة RLS تعتمد على assignee_id.';
COMMENT ON TABLE core.movement_effects IS 'المصدر الوحيد لأثر كل نوع حركة. مفروض بقيد FK من stock_movements.type — إضافة قيمة enum توجب صفًا هنا أولًا وإلا فشل الإدراج.';
COMMENT ON TABLE core.stock_movements IS 'دفتر أستاذ غير قابل للتعديل. لا UPDATE ولا DELETE — التصحيح بحركة معاكسة.';
COMMENT ON COLUMN core.stock_movements.quantity_m IS 'موجبة دائما. لا تخزن كميات سالبة — النوع هو ما يحدد دخولا أم خروجا.';
COMMENT ON COLUMN core.stock_movements.notes IS 'نص حر. لا يُدمج بالرمز أبدًا — الدمج يفسد التجميع في التقارير.';
COMMENT ON COLUMN core.stock_movements.idempotency_key IS 'يرسله العميل. المفتاح الفريد مع organization_id يجعل إعادة الإرسال بلا أثر.';
COMMENT ON COLUMN core.stock_movements.operation_group_id IS 'يجمع حركات إجراء مستخدم واحد (استهلاك 30 + زيادة 5 = صفان بنفس المعرّف). يُولَّد داخل الـRPC حصرًا — لا يُقبل من الجهاز أبدًا.';
COMMENT ON COLUMN core.stock_movements.fabric_usage_id IS 'حركات return فقط حاليًا: سجل الاستهلاك الذي يُرجَع منه. الـFK الخماسي يفرض تطابق المؤسسة والرول والحجز والمشروع مع السجل — لا يُقبل roll_id من العميل عند الإرجاع بل يُشتق كله من هذا السجل.';
COMMENT ON COLUMN core.stock_movements.reason_code IS 'رمز معتمد من movement_reasons — عليه تُبنى تقارير الهدر والإرجاع.';
COMMENT ON CONSTRAINT fabric_usage_link_shape ON core.stock_movements IS 'كل return يحمل السياق الكامل (usage + project + reservation) فلا يستطيع NULL إعفاءه من الـFK الخماسي، وأي حركة غير return لا تحمل fabric_usage_id. مع القيد الخماسي يصير تطابق الرول والحجز والمشروع مفروضًا فعلًا لا ادعاءً.';
COMMENT ON CONSTRAINT reason_code_required_for_exceptions ON core.stock_movements IS 'الحركات الاستثنائية تحتاج رمز سبب معتمدًا (FK) — لا نصًا حرًّا غير فارغ.';
COMMENT ON TABLE core.organization_members IS 'مصدر الحقيقة للصلاحيات. private.is_org_member و private.has_role يقرآن من هنا.';
COMMENT ON TABLE core.notifications IS 'إشعار لمستخدم بعينه. سياسة RLS: يرى المستخدم صفوفه هو فقط.';
COMMENT ON TABLE core.organizations IS 'المستأجر (tenant). كل بيانات العمل معلقة على هذا الجدول.';
COMMENT ON TABLE core.pricing_rules IS 'سعر الزبون وأجرة الخياط لكل متر ركض. قابل للتعديل من الأدمن وحده.';
COMMENT ON COLUMN core.pricing_rules.customer_price_per_meter_agorot IS 'بالأغورة. مثال: ₪290 = 29000.';
COMMENT ON COLUMN core.pricing_rules.tailor_cost_per_meter_agorot IS 'حساس: أجرة الخياط جزء من التكلفة الداخلية. لا تعرض لدور field.';
COMMENT ON COLUMN core.windows.height_cm IS 'يحدد نطاق التسعير: أقل من 330 = standard، و330 فأكثر = tall. فوق 500 يحتاج تسعيرة خاصة.';
COMMENT ON COLUMN core.windows.fullness IS 'مضاعف الكرمشة. أمتار القماش = المتر الركض × fullness (domain/pricing.ts).';
COMMENT ON TABLE core.quotation_items IS 'بنود مجمدة. لا تعدل بعد قفل النسخة — تنسخ إلى النسخة التالية بقيم جديدة.';
COMMENT ON COLUMN core.quotation_items.internal_cost_agorot IS 'حساس: تكلفة البند الداخلية.';
COMMENT ON COLUMN core.quotation_versions.internal_cost_agorot IS 'حساس: التكلفة الداخلية. تحذف من أي view لدور field أو tailor.';
COMMENT ON COLUMN core.quotation_versions.margin_percent IS 'حساس: هامش الربح. قد يكون سالبا عند البيع بخسارة — لذا بلا قيد >= 0.';
COMMENT ON COLUMN core.quotation_versions.locked IS 'العرض المرسل لقطة مجمدة. التعديل يعني نسخة جديدة، لا تحديثا.';
COMMENT ON TABLE core.tailor_assignments IS 'الخياط يرى المشاريع المسندة إليه فقط — سياسة RLS تعتمد على tailor_id.';
COMMENT ON TABLE core.document_sequences IS 'عدادات ترقيم المستندات (عروض الأسعار وغيرها) لكل مؤسسة وسنة. تُقرأ وتُكتب عبر RPC حصرًا تحت قفل FOR UPDATE على صف (المؤسسة، النوع، السنة) — لا منح لـauthenticated إطلاقًا.';
COMMENT ON TABLE core.user_devices IS 'رموز Expo Push. الربط المركب يضمن أن الجهاز مسجل ضمن المؤسسة نفسها.';
COMMENT ON CONSTRAINT stock_movements_type_effects_fk ON core.stock_movements IS 'قيمة enum جديدة بلا صف في movement_effects ترفض الإدراج بدل إسقاط الحركة صامتة من حسابات الأرصدة.';
COMMENT ON CONSTRAINT stock_movements_usage_consistency_fk ON core.stock_movements IS 'إرجاع إلى رول أو حجز أو مشروع غير الذي استُهلك منه = خطأ FK من المحرّك، حتى من الأدوار مرتفعة الصلاحية.';
