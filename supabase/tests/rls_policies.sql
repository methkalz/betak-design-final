-- ============================================================================
-- اختبار RLS حي — السيناريوهات الثمانية في security.html
-- كل شيء داخل transaction ينتهي بـ ROLLBACK: لا يبقى أي صف بعد الاختبار.
-- ============================================================================
\set ON_ERROR_STOP on
begin;

\echo '--- auth.uid() definition ---'
select pg_get_functiondef('auth.uid'::regproc);

-- ── مؤسستان ─────────────────────────────────────────────────────────────────
insert into core.organizations (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'بيتك ديزاين'),
  ('22222222-2222-2222-2222-222222222222', 'منافس');

insert into core.business_settings (organization_id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

-- ── أربعة مستخدمين + دخيل من المؤسسة الأخرى ─────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', u.email, 'x', now(), now(), now()
from (values
  ('aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'hamada@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'saher@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'abudani@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000004'::uuid, 'sales@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000001'::uuid, 'intruder@test.local')
) as u(id, email);

insert into core.profiles (id, full_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'حمادة زيدان'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'ساهر زيدان'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'أبو داني'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'موظف مبيعات'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'دخيل');

insert into core.organization_members (organization_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'field'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003', 'tailor'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000004', 'sales'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin');

-- ── بيانات المؤسسة الأولى ───────────────────────────────────────────────────
insert into core.customers (id, organization_id, full_name, phone) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'مثقال زيدان', '052');

insert into core.projects (id, organization_id, customer_id, code, status_code, tailor_id, field_worker_id)
values ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'c0000000-0000-0000-0000-000000000001', 'BD-1041', 'with_tailor',
        'aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002');

-- مشروع ثانٍ لا يخص أبو داني
insert into core.projects (id, organization_id, customer_id, code, status_code)
values ('d0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
        'c0000000-0000-0000-0000-000000000001', 'BD-1042', 'quotation');

insert into core.fabric_products (id, organization_id, name, kind, width_cm)
values ('e0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'كريب', 'crepe', 280);

insert into core.fabric_variants (id, organization_id, product_id, color_name, sku, cost_per_meter_agorot)
values ('e1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'e0000000-0000-0000-0000-000000000001', 'بيج دافئ', 'CR-BEIGE', 1400);

insert into core.fabric_rolls (id, organization_id, variant_id, code, initial_meters)
values ('e2000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'e1000000-0000-0000-0000-000000000001', 'CR-101', 100);

insert into core.stock_movements (organization_id, roll_id, type, quantity_m, created_by, idempotency_key)
values ('11111111-1111-1111-1111-111111111111', 'e2000000-0000-0000-0000-000000000001',
        'receipt', 100, 'aaaaaaaa-0000-0000-0000-000000000001', gen_random_uuid());

insert into core.quotations (id, organization_id, project_id, number)
values ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'd0000000-0000-0000-0000-000000000001', 'Q-1');

insert into core.quotation_versions (id, organization_id, quotation_id, version_number,
       subtotal_agorot, internal_cost_agorot, margin_percent, valid_until, created_by)
values ('f1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'f0000000-0000-0000-0000-000000000001', 1, 100000, 55000, 45, now() + interval '14 days',
        'aaaaaaaa-0000-0000-0000-000000000001');

-- بيانات المؤسسة الثانية
insert into core.customers (id, organization_id, full_name, phone)
values ('c0000000-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222', 'زبون المنافس', '050');

\echo ''
\echo '============ RESULTS ============'

-- ── مساعد: تنفيذ استعلام بهوية مستخدم ───────────────────────────────────────
create or replace function pg_temp.as_user(p_uid uuid, p_sql text)
returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  execute p_sql into n;
  perform set_config('role', 'postgres', true);
  return n;
exception when others then
  perform set_config('role', 'postgres', true);
  return -1;  -- -1 يعني رُفض بخطأ (وليس صفر صف)
end $$;

\echo ''
\echo '1) عزل المؤسسات — الدخيل لا يرى زبائن بيتك ديزاين'
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001',
  $$select count(*) from api.customers where full_name = 'مثقال زيدان'$$) as must_be_0;

\echo ''
\echo '2) الأدمن يرى زبائنه'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001',
  $$select count(*) from api.customers$$) as must_be_1;

\echo ''
\echo '3) أبو داني (خياط) لا يرى الربح — الview المالي'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000003',
  $$select count(*) from api.quotation_version_financials$$) as must_be_0;

\echo ''
\echo '4) الأدمن يرى الربح'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001',
  $$select count(*) from api.quotation_version_financials$$) as must_be_1;

\echo ''
\echo '5) ساهر (ميداني) لا يرى سعر الجملة'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000002',
  $$select count(*) from api.fabric_variant_costs$$) as must_be_0;

\echo ''
\echo '6) لكن ساهر يرى القماش نفسه (بلا تكلفة)'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000002',
  $$select count(*) from api.fabric_variants$$) as must_be_1;

\echo ''
\echo '7) أبو داني يرى مشروعه المسند إليه فقط (لا BD-1042)'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000003',
  $$select count(*) from api.projects$$) as must_be_1;

\echo ''
\echo '8) الأدمن يرى المشروعين'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001',
  $$select count(*) from api.projects$$) as must_be_2;

\echo ''
\echo '9) الخياط لا يستطيع كتابة حركة مخزون (لا سياسة INSERT)'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000003',
  $$with x as (insert into core.stock_movements
       (organization_id, roll_id, type, quantity_m, created_by, idempotency_key)
       values ('11111111-1111-1111-1111-111111111111','e2000000-0000-0000-0000-000000000001',
               'receipt', 999, 'aaaaaaaa-0000-0000-0000-000000000003', gen_random_uuid())
       returning 1) select count(*) from x$$) as must_be_minus_1;

\echo ''
\echo '10) حتى الأدمن لا يكتب حركة مخزون مباشرة (RPC فقط)'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001',
  $$with x as (insert into core.stock_movements
       (organization_id, roll_id, type, quantity_m, created_by, idempotency_key)
       values ('11111111-1111-1111-1111-111111111111','e2000000-0000-0000-0000-000000000001',
               'receipt', 999, 'aaaaaaaa-0000-0000-0000-000000000001', gen_random_uuid())
       returning 1) select count(*) from x$$) as must_be_minus_1;

\echo ''
\echo '11) الخياط لا يكتب دفعة'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000003',
  $$with x as (insert into core.payments
       (organization_id, project_id, amount_agorot, kind, method, created_by)
       values ('11111111-1111-1111-1111-111111111111','d0000000-0000-0000-0000-000000000001',
               5000,'deposit','cash','aaaaaaaa-0000-0000-0000-000000000003')
       returning 1) select count(*) from x$$) as must_be_minus_1;

\echo ''
\echo '12) الميداني لا يرى الدفعات'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000002',
  $$select count(*) from api.payments$$) as must_be_0;

\echo ''
\echo '13) الدخيل لا يرى مشاريع بيتك ديزاين'
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001',
  $$select count(*) from api.projects$$) as must_be_0;

\echo ''
\echo '14) رصيد الرول يُشتق صحيحًا للأدمن (100 مستلمة)'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001',
  $$select on_hand_m::bigint from api.inventory_roll_balances where code='CR-101'$$) as must_be_100;

\echo ''
\echo '15) الميداني لا يرى إعدادات التكلفة'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000002',
  $$select count(*) from api.business_settings_costs$$) as must_be_0;

\echo ''
\echo '16) لكنه يرى الإعدادات غير المالية'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000002',
  $$select count(*) from api.business_settings$$) as must_be_1;

\echo ''
\echo '17) الخياط يرى مشروعه لكن اسم الزبون فارغ (LEFT JOIN مقصود)'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000003',
  $$select count(*) from api.project_details where customer_name is null$$) as must_be_1;

\echo ''
\echo '18) الأدمن يرى اسم الزبون'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001',
  $$select count(*) from api.project_details where customer_name = 'مثقال زيدان'$$) as must_be_2;

\echo ''
\echo '18b) شاشة الخياط: لا عمود تكلفة ولا ربح ولا زبون في التعريف أصلًا'
select count(*) as must_be_0 from information_schema.columns
 where table_schema='api' and table_name='tailor_project_details'
   and (column_name like '%cost%' or column_name like '%margin%'
        or column_name like '%customer%' or column_name like '%price%');

\echo ''
\echo '19) الميداني يرى كتالوج الرولات'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000002',
  $$select count(*) from api.fabric_rolls$$) as must_be_1;

\echo ''
\echo '20) لكنه لا يرى الأرصدة (بدل رقم صفري مضلّل)'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000002',
  $$select count(*) from api.inventory_roll_balances$$) as must_be_0;

\echo ''
\echo '21) الخياط يرى حجوزات مشروعه'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000003',
  $$select count(*) from api.fabric_reservations$$) as must_be_0_no_reservations_seeded;

\echo ''
\echo '22) المبيعات يرى الربح (دور مالي)'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000004',
  $$select count(*) from api.quotation_version_financials$$) as must_be_1;

\echo ''
\echo '23) المبيعات لا يعدّل قواعد التسعير'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000004',
  $$with x as (update core.pricing_rules set customer_price_per_meter_agorot=1
       where organization_id='11111111-1111-1111-1111-111111111111' returning 1)
    select count(*) from x$$) as must_be_0_or_minus1;

\echo ''
\echo '======== WRITE SURFACE & GUARDS ========'

\echo ''
\echo '24) المبيعات ينشئ زبونًا عبر api.customers (كتابة مباشرة مسموحة)'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000004',
  $$with x as (insert into api.customers (organization_id, full_name, phone, city, address, notes, preferences)
       values ('11111111-1111-1111-1111-111111111111','زبون جديد','053','','','','{}')
       returning 1) select count(*) from x$$) as must_be_1;

\echo ''
\echo '25) الخياط لا ينشئ زبونًا'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000003',
  $$with x as (insert into api.customers (organization_id, full_name, phone, city, address, notes, preferences)
       values ('11111111-1111-1111-1111-111111111111','تسلل','000','','','','{}')
       returning 1) select count(*) from x$$) as must_be_0_or_minus1;

\echo ''
\echo '26) الميداني يضيف غرفة لمشروعه'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000002',
  $$with x as (insert into api.rooms (organization_id, project_id, name, floor, sort_order)
       values ('11111111-1111-1111-1111-111111111111','d0000000-0000-0000-0000-000000000001','صالون','1',1)
       returning 1) select count(*) from x$$) as must_be_1;

\echo ''
\echo '27) تغيير status_code مباشرة مرفوض (RPC حصرًا)'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001',
  $$with x as (update api.projects set status_code='completed'
       where project_id='d0000000-0000-0000-0000-000000000001' returning 1)
    select count(*) from x$$) as must_be_minus_1;

\echo ''
\echo '28) لكن تعديل الملاحظة مسموح، و lock_version يرتفع تلقائيًا'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001',
  $$with x as (update api.projects set notes='ملاحظة محدثة'
       where project_id='d0000000-0000-0000-0000-000000000001' returning 1)
    select count(*) from x$$) as must_be_1;
select lock_version as must_be_2 from core.projects
 where id='d0000000-0000-0000-0000-000000000001';

\echo ''
\echo '29) دفتر حركة المخزون غير قابل للتعديل — حتى كـpostgres'
do $$
begin
  update core.stock_movements set quantity_m = 1;
  raise notice 'FAIL: the ledger was mutable';
exception when others then
  raise notice 'OK blocked: %', SQLERRM;
end $$;

\echo ''
\echo '30) الدفعات غير قابلة للحذف'
do $$
begin
  delete from core.payments;
  raise notice 'OK (no rows) or blocked';
exception when others then
  raise notice 'OK blocked: %', SQLERRM;
end $$;

\echo ''
\echo '31) نسخة عرض مقفلة: تعديل المبلغ مرفوض'
update core.quotation_versions set locked = true, sent_at = now()
 where id='f1000000-0000-0000-0000-000000000001';
do $$
begin
  update core.quotation_versions set total_agorot = 1
   where id='f1000000-0000-0000-0000-000000000001';
  raise notice 'FAIL: locked version was mutable';
exception when others then
  raise notice 'OK blocked: %', SQLERRM;
end $$;

\echo ''
\echo '32) لكن الاعتماد مسموح على النسخة المقفلة'
do $$
begin
  update core.quotation_versions set status='approved', approved_at=now()
   where id='f1000000-0000-0000-0000-000000000001';
  raise notice 'OK: approval allowed on locked version';
exception when others then
  raise notice 'FAIL: %', SQLERRM;
end $$;

\echo ''
\echo '33) لا حذف فعلي للزبون'
do $$
begin
  delete from core.customers where id='c0000000-0000-0000-0000-000000000001';
  raise notice 'FAIL: customer was deleted';
exception when others then
  raise notice 'OK blocked: %', SQLERRM;
end $$;

rollback;
