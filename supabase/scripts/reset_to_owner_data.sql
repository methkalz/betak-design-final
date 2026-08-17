-- ════════════════════════════════════════════════════════════════════
-- تصفير البيانات إلى بيانات المالك المعتمدة (قرار 17.8.2026)
--
-- يُمحى ما كان بيانات حقبة التجربة (زبائن ومشاريع وشبابيك ورولات
-- وحركاتها وسجلاتها)، ويُزرع الطاقم الحقيقي والزبونان والمخزون
-- الابتدائي: 500 متر من كل صنف قماشٍ حيّ في المكتبة.
--
-- يبقى بلا مساس: مكتبة الأقمشة وأسعار المالك وقواعد التسعير الثماني.
--
-- الهوية عند الدخول رقم الهاتف: يُطبَّع إلى 972… ويُشتق منه بريد
-- اصطلاحي <972…>@baytak.local لا يُرسَل إليه شيء أبدًا. كلمات السر
-- تُولَّد عشوائيًا ولا تُكتب في أي ملف يُرفَع - تُسلَّم للمالك في ملف
-- محلي ويغيّرها كل موظف عند أول دخول.
--
--   docker exec -i <supabase-db> psql -U postgres -v ON_ERROR_STOP=1 \
--     -v p_admin="'...'" -v p_tailor="'...'" -v p_field="'...'" \
--     < supabase/scripts/reset_to_owner_data.sql
-- ════════════════════════════════════════════════════════════════════

-- ⚠️ سكربت **هدّام**: يمحو كل الزبائن والمشاريع والحركات وحسابات الدخول.
-- يُشغَّل مرةً واحدة عند التسليم (cutover) لا بعده. أخذ نسخةً احتياطية أولًا:
--   docker exec <db> pg_dump -U postgres --data-only --schema=core --schema=auth > backup.sql
-- الحارس أدناه يرفض التشغيل إن وُجد عملٌ حقيقي (دفعة أو أمر إنتاج أو عرض
-- مُرسَل)، فلا يمحو يومَ عملٍ بضغطة سهو. للتجاوز عن قصد يُسبَق التشغيل بـ:
--   set baytak.force = '1';

begin;

do $guard$
declare v_real integer;
begin
  select (select count(*) from core.payments)
       + (select count(*) from core.tailor_assignments)
       + (select count(*) from core.quotation_versions where sent_at is not null)
    into v_real;
  if v_real > 0 and coalesce(current_setting('baytak.force', true), '') <> '1' then
    raise exception
      'رفض المحو: القاعدة تحمل عملًا حقيقيًا (% سجلًا). للتجاوز عن قصد شغّل: set baytak.force = ''1'';',
      v_real;
  end if;
end $guard$;

-- ── هوية المعرض ────────────────────────────────────────────────────────
update core.organizations
   set name = 'معرض بيتك ديزاين'
 where id = (select organization_id from core.business_settings limit 1);

-- ── محو حقبة التجربة (بترتيب الاعتماديات) ──────────────────────────────
set local session_replication_role = replica;

delete from core.client_operations;
delete from core.audit_logs;
delete from core.notifications;
delete from core.attachments;
delete from core.staff_ledger;
delete from core.payments;
delete from core.field_visits;
delete from core.tailor_assignments;
delete from core.discount_requests;
delete from core.quotation_items;
delete from core.quotation_versions;
delete from core.quotations;
delete from core.fabric_usage;
delete from core.stock_movements;
delete from core.fabric_reservations;
delete from core.fabric_rolls;
delete from core.windows;
delete from core.rooms;
delete from core.projects;
delete from core.customers;
delete from core.document_sequences;
delete from core.user_devices;
delete from core.organization_members;
delete from core.profiles;
delete from auth.identities;
delete from auth.sessions;
delete from auth.refresh_tokens;
delete from auth.users;

set local session_replication_role = origin;

-- ── الطاقم: ثلاثة حسابات، هويتها أرقام هواتفها ─────────────────────────
with org as (select organization_id as id from core.business_settings limit 1),
     staff(uid, full_name, phone, role, pass) as (values
  ('11110000-0000-4000-8000-000000000001'::uuid, 'حمادة زيدان',
   '054-9068709', 'admin',  :p_admin),
  ('11110000-0000-4000-8000-000000000002'::uuid, 'أبو داني',
   '053-2743339', 'tailor', :p_tailor),
  ('11110000-0000-4000-8000-000000000003'::uuid, 'أبو الصبحي',
   '050-9270077', 'field',  :p_field))
-- عمود auth.users.phone يُترك فارغًا عمدًا: الهوية بريدٌ مشتق، وملء
-- عمود الهاتف يجرّ خدمة الهوية إلى مسار تحقّقٍ بالرسائل لا نريده
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at, raw_user_meta_data)
select s.uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       -- الهوية من الأرقام المجرّدة: 054-9068709 ← 972549068709@baytak.local
       '972' || pg_catalog.ltrim(pg_catalog.translate(s.phone, '-', ''), '0') || '@baytak.local',
       extensions.crypt(s.pass, extensions.gen_salt('bf')),
       now(), now(), now(),
       jsonb_build_object('full_name', s.full_name, 'phone', s.phone)
from staff s, org;

-- ── إتمام ما تطلبه خدمة الهوية ولا تفرضه القاعدة ───────────────────────
-- درس اصطاده الاختبار الحقيقي: الحساب يبدو سليمًا ويُخفق الدخول برسالة
-- «Database error querying schema» - لأن قارئ GoTrue يسكب أعمدة الرموز
-- في نصٍّ لا يقبل NULL، ولأن كل حساب يحتاج صفَّ هويةٍ لمزوّد البريد.
-- (عمود identities.email مُولَّد فلا يُدرَج مباشرة.)
update auth.users set
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
where email like '%@baytak.local';

insert into auth.identities
  (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email,
                          'email_verified', true, 'phone_verified', false),
       'email', now(), now()
from auth.users u
where u.email like '%@baytak.local'
  and not exists (select 1 from auth.identities i
                  where i.user_id = u.id and i.provider = 'email');

-- المسمّى الوظيفي ليس تزيينًا: شاشتا الطاقم والإعدادات تطبعانه قبل الرقم،
-- وفراغه يُخرج نقطةً معلّقة بلا شيء قبلها
insert into core.profiles (id, full_name, phone, title)
select s.uid, s.name, s.phone, s.title from (values
  ('11110000-0000-4000-8000-000000000001'::uuid, 'حمادة زيدان', '054-9068709', 'إدارة المعرض'),
  ('11110000-0000-4000-8000-000000000002'::uuid, 'أبو داني', '053-2743339', 'خيّاط'),
  ('11110000-0000-4000-8000-000000000003'::uuid, 'أبو الصبحي', '050-9270077', 'قياس وتركيب')
) as s(uid, name, phone, title);

insert into core.organization_members (organization_id, user_id, role, is_active)
select o.id, s.uid, s.role::core.app_role, true
from (values
  ('11110000-0000-4000-8000-000000000001'::uuid, 'admin'),
  ('11110000-0000-4000-8000-000000000002'::uuid, 'tailor'),
  ('11110000-0000-4000-8000-000000000003'::uuid, 'field')
) as s(uid, role), (select organization_id as id from core.business_settings limit 1) o;

-- ── الزبونان ───────────────────────────────────────────────────────────
insert into core.customers (organization_id, full_name, phone)
select o.id, c.name, c.phone
from (values
  ('مثقال زيدان', '052-6444414'),
  ('رواد زيدان',  '054-4614364')
) as c(name, phone), (select organization_id as id from core.business_settings limit 1) o;

-- ── المخزون الابتدائي: 500 متر من كل صنف حيّ ───────────────────────────
-- رمز الرول من رمز الصنف المخزني، ودفعة صبغ واحدة لافتتاح المخزون
with org as (select organization_id as id from core.business_settings limit 1),
     ins as (
  insert into core.fabric_rolls
    (organization_id, variant_id, code, dye_lot, location, initial_meters)
  select org.id, v.id, v.sku || '-R1', 'LOT-OPEN', 'المخزن', 500
  from core.fabric_variants v, org
  where v.organization_id = org.id and v.archived_at is null
  returning id
)
insert into core.stock_movements
  (organization_id, roll_id, type, quantity_m, notes, created_by, idempotency_key)
select org.id, ins.id, 'receipt', 500, 'افتتاح المخزون',
       '11110000-0000-4000-8000-000000000001'::uuid, gen_random_uuid()
from ins, org;

commit;

-- ── تحقّق بصري ─────────────────────────────────────────────────────────
select 'org: ' || name from core.organizations;
select 'staff: ' || p.full_name || ' / ' || om.role || ' / ' || p.phone
from core.organization_members om join core.profiles p on p.id = om.user_id
order by om.role;
select 'customer: ' || full_name || ' / ' || phone from core.customers order by full_name;
select 'stock: ' || v.sku || ' = ' || b.on_hand_m || ' م متاح ' || b.available_m
from core.fabric_rolls r
join core.fabric_variants v on v.id = r.variant_id
cross join lateral private.roll_balance(r.id) b
order by v.sku;
select 'projects=' || count(*) from core.projects;
select 'login emails: ' || string_agg(email, ', ' order by email) from auth.users;
