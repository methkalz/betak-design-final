-- ════════════════════════════════════════════════════════════════════
-- صورة الشيك: الصفُّ والبايتات معًا
--
-- التدقيق العدائي اصطاد نصف حراسة: سياسة الصف على core.attachments صارت
-- تحجب kind='check' عن غير الإدارة والمبيعات، لكن **البايتات** في
-- storage.objects كانت تُحرَس بالمسار وحده - عضوية المؤسسة ورؤية المشروع.
-- والخياط المسنَد يرى المشروع، فكان يستطيع سرد المجلد بـlist() وتوقيع
-- رابطٍ لأي ملفٍ فيه: الصف محجوب والصورة مكشوفة. صورةٌ فيها حساب الزبون
-- البنكي وتوقيعه.
--
-- العلاج مسارٌ ثالث ينطق: <org>/<project>/checks/<id>.<ext>. المقطعان
-- الأول والثاني يبقيان كما هما فلا تتأذى سياسات صور العمل، والمقطع
-- الثالث يقرؤه الحارس. ولم يُختر الربطُ بجدول المرفقات عمدًا: استعلامٌ
-- فرعيٌّ عليه داخل السياسة يُصفَّى بسياسة المرفقات نفسها، فيبدو صفّ
-- الشيك غائبًا ويمرّ الحارس - حراسةٌ تنقض نفسها.
--
-- ملاحظة: لا صور شيكاتٍ على المسار القديم في الإنتاج (لا مشاريع بعد)،
-- فلا نقل ملفاتٍ يلزم.
-- ════════════════════════════════════════════════════════════════════

drop policy if exists "attachments upload to visible projects" on storage.objects;
create policy "attachments upload to visible projects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'attachments'
  and private.is_org_member(((storage.foldername(name))[1])::uuid)
  and private.can_see_project(((storage.foldername(name))[1])::uuid,
                              ((storage.foldername(name))[2])::uuid)
  and ((storage.foldername(name))[3] is distinct from 'checks'
       or private.has_role(((storage.foldername(name))[1])::uuid,
                           array['admin'::core.app_role, 'sales'::core.app_role]))
);

drop policy if exists "attachments readable for visible projects" on storage.objects;
create policy "attachments readable for visible projects"
on storage.objects for select to authenticated
using (
  bucket_id = 'attachments'
  and private.is_org_member(((storage.foldername(name))[1])::uuid)
  and private.can_see_project(((storage.foldername(name))[1])::uuid,
                              ((storage.foldername(name))[2])::uuid)
  and ((storage.foldername(name))[3] is distinct from 'checks'
       or private.has_role(((storage.foldername(name))[1])::uuid,
                           array['admin'::core.app_role, 'sales'::core.app_role]))
);
