-- ════════════════════════════════════════════════════════════════════
-- مخزن المرفقات: الدلو وسياساته
--
-- صور القياس والتركيب والقماش تسكن دلوًا خاصًا (لا عامًا) على مسارٍ
-- منظَّم: <org_id>/<project_id>/<attachment_id>.<ext> - فتنطق السياسات
-- من المسار نفسه: الرفع والقراءة كلاهما لعضو المؤسسة الذي يرى المشروع
-- (can_see_project كسياسة صف المرفقات نفسها)، والعرض في التطبيق
-- بروابط موقّعة مؤقتة لا روابط عامة. لا حذف: الدفاتر لا تُمحى.
--
-- صف core.attachments سطحه المباشر جاهز منذ الأساس (منحة INSERT +
-- سياسة «upload to visible projects») - هذه البنية تكمل شقّ البايتات.
-- ════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "attachments upload to visible projects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'attachments'
  and private.is_org_member(((storage.foldername(name))[1])::uuid)
  and private.can_see_project(((storage.foldername(name))[1])::uuid,
                              ((storage.foldername(name))[2])::uuid)
);

-- القراءة كسياسة صف المرفقات نفسها: من يرى المشروع يرى صوره - عضوية
-- المؤسسة وحدها كانت تفتح صور بيوت الزبائن لخياطٍ لا يرى مشاريعها
create policy "attachments readable for visible projects"
on storage.objects for select to authenticated
using (
  bucket_id = 'attachments'
  and private.is_org_member(((storage.foldername(name))[1])::uuid)
  and private.can_see_project(((storage.foldername(name))[1])::uuid,
                              ((storage.foldername(name))[2])::uuid)
);
