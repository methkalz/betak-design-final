-- ============================================================================
-- سلامة العلاقات والحالات لطبقة عروض الأسعار — تنفيذ بنود المراجعة 1,2,3,5,7
-- على عقود §10 (DECISIONS.md). محرك التسعير ودوال الـRPC ليسا هنا — ينتظران
-- تصديق الوثيقة المعدلة.
--
-- الجداول الثلاثة فارغة وقت الترحيل (فحص 2026-08-03: 0/0/0) فإضافة القيود آمنة.
-- ملاحظة MATCH SIMPLE (درس ترحيل 0032): العمود الوحيد القابل لـNULL في مفاتيح
-- هذا الملف المركبة هو current_version_id نفسه، وNULL فيه يعني «لا نسخة حالية»
-- عمدًا — لا يوجد مسار تجاوز جزئي لأن بقية الأعمدة NOT NULL.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- (بند 1) ربط النسخة بعرضها على مستوى المحرك
-- كان FK النسخة الحالية يتحقق من (المؤسسة، النسخة) فقط، فيقبل نظريًا نسخة
-- تابعة لعرض آخر في نفس المؤسسة. المفتاح الثلاثي يقفل الانتماء.
-- ────────────────────────────────────────────────────────────────────────────

alter table core.quotation_versions
  add constraint quotation_versions_org_id_quotation_key
  unique (organization_id, id, quotation_id);

alter table core.quotations
  drop constraint quotations_current_version_fk;

alter table core.quotations
  add constraint quotations_current_version_fk
  foreign key (organization_id, current_version_id, id)
  references core.quotation_versions (organization_id, id, quotation_id)
  on delete set null (current_version_id);

-- عرض أب واحد لكل مشروع: النسخ المتعددة تعيش داخل العرض الواحد،
-- لا عبر عروض متوازية للمشروع نفسه. الفهرس العادي يُستبدل بالقيد الفريد
-- (فهرس القيد يغطي نفس الاستعلامات).
drop index core.quotations_project_idx;

alter table core.quotations
  add constraint quotations_one_per_project
  unique (organization_id, project_id);

-- طلب الخصم يرتبط بالزوج (النسخة، العرض) معًا — القديم الثنائي كان يسمح
-- بربط طلب بعرضٍ وبنسخةٍ تخص عرضًا آخر. الثلاثي يجعل التطابق محركيًا،
-- وFK العرض الثنائي يبقى لدلالة الـCASCADE المباشرة.
alter table core.discount_requests
  drop constraint discount_requests_organization_id_version_id_fkey;

alter table core.discount_requests
  add constraint discount_requests_version_belongs_to_quotation_fk
  foreign key (organization_id, version_id, quotation_id)
  references core.quotation_versions (organization_id, id, quotation_id)
  on delete cascade;


-- ────────────────────────────────────────────────────────────────────────────
-- (بند 4 — الجزء المحركي) بصمة محتوى النسخة وقت طلب الخصم
-- الموافقة على خصم تُمنح لمحتوى محدد؛ إن تغيّر محتوى النسخة بعد الموافقة
-- بطلت صلاحيتها. RPC الإرسال يعيد حساب البصمة ويقارن، وRPC الطلب يملؤها.
-- الجدول RPC-only أصلًا (لا منح كتابة لـauthenticated) والقيد يمنع نشوء
-- طلب بلا بصمة من أي مسار.
-- ────────────────────────────────────────────────────────────────────────────

alter table core.discount_requests
  add column content_fingerprint text not null;

alter table core.discount_requests
  add constraint discount_requests_fingerprint_check
  check (length(btrim(content_fingerprint)) > 0);


-- ────────────────────────────────────────────────────────────────────────────
-- (بند 5) أعمدة الوقائع التجارية + قيد شكل دورة الحياة الكامل
-- «من أرسل، ومن سجّل قرار الزبون، ومتى» وقائع تجارية لا مجرد enum.
-- ────────────────────────────────────────────────────────────────────────────

alter table core.quotation_versions
  add column sent_by uuid,
  add column rejected_at timestamp with time zone,
  add column superseded_at timestamp with time zone,
  add column decision_recorded_by uuid,
  add column decision_note text not null default '';

alter table core.quotation_versions
  add constraint quotation_versions_organization_id_sent_by_fkey
  foreign key (organization_id, sent_by)
  references core.organization_members (organization_id, user_id)
  on delete restrict;

alter table core.quotation_versions
  add constraint quotation_versions_organization_id_decision_recorded_by_fkey
  foreign key (organization_id, decision_recorded_by)
  references core.organization_members (organization_id, user_id)
  on delete restrict;

-- قيد locked القديم كان أحادي الاتجاه (sent_at → locked) ولا يمنع مسودة
-- مقفلة ولا اعتمادًا بلا مسجِّل قرار. قيد الشكل يفرض التركيبة الكاملة لكل
-- حالة، وelse false يُسقط أي قيمة enum مستقبلية لم تُعرَّف صراحة هنا.
alter table core.quotation_versions
  drop constraint sent_versions_are_locked;

alter table core.quotation_versions
  add constraint version_lifecycle_shape check (
    case status
      when 'draft' then
            sent_at is null and sent_by is null and locked = false
        and approved_at is null and rejected_at is null
        and superseded_at is null and decision_recorded_by is null
      when 'sent' then
            sent_at is not null and sent_by is not null and locked
        and approved_at is null and rejected_at is null
        and superseded_at is null and decision_recorded_by is null
      when 'approved' then
            sent_at is not null and sent_by is not null and locked
        and approved_at is not null and decision_recorded_by is not null
        and rejected_at is null and superseded_at is null
      when 'rejected' then
            sent_at is not null and sent_by is not null and locked
        and rejected_at is not null and decision_recorded_by is not null
        and length(btrim(decision_note)) > 0
        and approved_at is null and superseded_at is null
      when 'expired' then
            sent_at is not null and sent_by is not null and locked
        and approved_at is null and rejected_at is null
        and decision_recorded_by is null
      when 'superseded' then
            locked and superseded_at is not null
        and (sent_at is null) = (sent_by is null)
        and approved_at is null and rejected_at is null
      else false
    end
  );


-- ────────────────────────────────────────────────────────────────────────────
-- (بند 2) قواعد التفرد: نسخة واحدة قابلة للعمل في كل طور
-- مسودة واحدة، مرسلة واحدة، ومعتمدة واحدة كحد أقصى لكل عرض — فهارس جزئية
-- تجعل «لا يمكن وجود أكثر من نسخة واحدة قابلة للاعتماد» قيدًا لا عرفًا.
-- ────────────────────────────────────────────────────────────────────────────

create unique index quotation_versions_one_draft_idx
  on core.quotation_versions (organization_id, quotation_id)
  where status = 'draft';

create unique index quotation_versions_one_sent_idx
  on core.quotation_versions (organization_id, quotation_id)
  where status = 'sent';

create unique index quotation_versions_one_approved_idx
  on core.quotation_versions (organization_id, quotation_id)
  where status = 'approved';


-- ────────────────────────────────────────────────────────────────────────────
-- (بند 3) مصدر حقيقة واحد للانقضاء
-- الحالة المخزنة لا تُعدَّل عرضيًا؛ effective_status يُشتق عند القراءة من
-- valid_until، وأي RPC قرارٍ يفحص الانقضاء تحت القفل ويرفض بـBD409.
-- تثبيت expired في العمود المخزن مؤجل لمهمة دورية مستقبلية (خارج الـMVP).
-- إعادة إنشاء الـview تُبقي الأعمدة القائمة بترتيبها وتضيف الجديدة في الذيل.
-- ────────────────────────────────────────────────────────────────────────────

create or replace view api.quotation_versions
with (security_invoker = on) as
select
  ver.id as version_id,
  ver.organization_id,
  ver.quotation_id,
  ver.version_number,
  ver.status,
  ver.subtotal_agorot,
  ver.discount_percent,
  ver.discount_agorot,
  ver.vat_agorot,
  ver.total_agorot,
  ver.valid_until,
  ver.valid_until < now() as is_expired,
  ver.note,
  ver.created_by,
  ver.created_at,
  ver.sent_at,
  ver.approved_at,
  ver.locked,
  ver.rejected_at,
  ver.superseded_at,
  ver.sent_by,
  ver.decision_recorded_by,
  ver.decision_note,
  case
    when ver.status = 'sent' and ver.valid_until < now()
      then 'expired'::core.quotation_status
    else ver.status
  end as effective_status
from core.quotation_versions ver;


-- ────────────────────────────────────────────────────────────────────────────
-- (بند 7) عدادات مستندات لكل مؤسسة وسنة — ترقيم Q-YYYY-#### بلا سباقات
-- max+1 يكفي لترقيم النسخ (صف العرض يُقفل)، لكنه لا يكفي للعرض الأول
-- (لا صف يُقفل بعد). RPC الإنشاء يعمل upsert ثم UPDATE تحت قفل صف العداد.
-- السنة تُشتق من توقيت المؤسسة (business_settings.timezone) لا من توقيت
-- جلسة PostgreSQL.
-- ────────────────────────────────────────────────────────────────────────────

create table core.document_sequences (
  organization_id uuid    not null references core.organizations (id) on delete cascade,
  doc_type        text    not null,
  year            integer not null,
  last_number     integer not null default 0,
  primary key (organization_id, doc_type, year),
  constraint document_sequences_doc_type_check    check (length(btrim(doc_type)) > 0),
  constraint document_sequences_year_check        check (year between 2000 and 2100),
  constraint document_sequences_last_number_check check (last_number >= 0)
);

comment on table core.document_sequences is
  'عدادات ترقيم المستندات (عروض الأسعار وغيرها) لكل مؤسسة وسنة. تُقرأ وتُكتب '
  'عبر RPC حصرًا تحت قفل FOR UPDATE على صف (المؤسسة، النوع، السنة) — لا منح '
  'لـauthenticated إطلاقًا.';

alter table core.document_sequences enable row level security;
alter table core.document_sequences force row level security;

grant select, insert, update on core.document_sequences to baytak_rpc_owner;

alter table core.business_settings
  add column timezone text not null default 'Asia/Jerusalem';

alter table core.business_settings
  add constraint business_settings_timezone_check
  check (length(btrim(timezone)) > 0);

comment on column core.business_settings.timezone is
  'المنطقة الزمنية للمؤسسة (اسم IANA). تُستعمل لاشتقاق سنة ترقيم المستندات؛ '
  'اسم غير صالح يُفشل عملية الترقيم بخطأ صريح من at time zone.';
