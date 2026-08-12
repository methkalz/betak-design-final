"""المال على الخادم: الدفعات والشيكات والعكس ودفتر الطاقم.

عقد §11 حرفًا (لا دفعة قبل عرض معتمد)، الشيكل صحيح دائمًا، رزمة الشيكات
CHK i/N بمواعيد صرفها، قيد العكس السالب المرتبط بأصله لا يتكرر، ودفتر
الطاقم insert-only بإشعار صاحبه.
"""
import sys, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.environ.get('VPS_HELPER_DIR', HERE)
sys.path.insert(0, HELPER)
from vps import run, put_text  # noqa: E402

IID = os.environ.get('BAYTAK_INSTANCE_ID') or open(
    os.path.join(HELPER, 'instance_id.txt')).read().strip()
DB = os.environ.get('BAYTAK_DB_CONTAINER') or f'supabase-db-{IID}'

ORG   = 'dddd8888-0000-4000-8000-000000000001'
ADMIN = 'dddd8888-0000-4000-8000-0000000000a1'
SALES = 'dddd8888-0000-4000-8000-0000000000a2'
T1    = 'dddd8888-0000-4000-8000-0000000000a3'
CUST  = 'dddd8888-0000-4000-8000-0000000000c1'
PRJ   = 'dddd8888-0000-4000-8000-0000000000d1'  # بعرض معتمد
PRJ2  = 'dddd8888-0000-4000-8000-0000000000d2'  # بلا عرض
QT    = 'dddd8888-0000-4000-8000-0000000000q1'
QV    = 'dddd8888-0000-4000-8000-0000000000v1'


def key(n): return f'dddd8888-0000-4000-8000-00000000ee{n:02d}'


passed, failed = [], []


def sql(text, quiet=True):
    put_text(text + '\n', '/tmp/payrpc.sql')
    return run(f'docker exec -i {DB} psql -U postgres {"-q" if quiet else ""} < /tmp/payrpc.sql 2>&1')


def as_user(uid, body):
    return sql(
        "set role postgres;\n"
        f"select set_config('request.jwt.claims',"
        f"'{{\"sub\":\"{uid}\",\"role\":\"authenticated\"}}',false) \\g /dev/null\n"
        "set role authenticated;\n" + body, quiet=False)


def check(name, ok, detail=''):
    (passed if ok else failed).append(name)
    print(f'{"PASS" if ok else "FAIL"}  {name}')
    if not ok and detail:
        print('      ' + detail.strip().replace('\n', '\n      ')[:700])


def grab(pattern, text):
    m = re.search(pattern, text)
    return m.group(1) if m else None


PURGE = f"""
set session_replication_role = replica;
delete from core.client_operations   where organization_id = '{ORG}';
delete from core.audit_logs          where organization_id = '{ORG}';
delete from core.notifications       where organization_id = '{ORG}';
delete from core.staff_ledger        where organization_id = '{ORG}';
delete from core.payments            where organization_id = '{ORG}';
delete from core.quotation_versions  where organization_id = '{ORG}';
delete from core.quotations          where organization_id = '{ORG}';
delete from core.projects            where organization_id = '{ORG}';
delete from core.customers           where organization_id = '{ORG}';
delete from core.organization_members where organization_id = '{ORG}';
delete from core.business_settings   where organization_id = '{ORG}';
delete from core.organizations       where id = '{ORG}';
delete from core.profiles            where id in ('{ADMIN}','{SALES}','{T1}');
delete from auth.users               where id in ('{ADMIN}','{SALES}','{T1}');
set session_replication_role = origin;
"""

print('=== seeding ===')
users = ",\n ".join(
    f"('{u}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pay{i}@t.local','x',now(),now(),now())"
    for i, u in enumerate([ADMIN, SALES, T1]))
out = sql(PURGE + f"""
insert into core.organizations (id,name) values ('{ORG}','مال المعرض');
insert into core.business_settings (organization_id) values ('{ORG}');
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,
                        email_confirmed_at,created_at,updated_at) values
 {users};
insert into core.profiles (id,full_name) values
 ('{ADMIN}','أدمن المال'), ('{SALES}','بائع المال'), ('{T1}','خياط المال');
insert into core.organization_members (organization_id,user_id,role,is_active) values
 ('{ORG}','{ADMIN}','admin',true), ('{ORG}','{SALES}','sales',true),
 ('{ORG}','{T1}','tailor',true);
insert into core.customers (id,organization_id,full_name,phone)
values ('{CUST}','{ORG}','زبون المال','05');
insert into core.projects (id,organization_id,customer_id,code,status_code) values
 ('{PRJ}','{ORG}','{CUST}','PM-1','customer_approved'),
 ('{PRJ2}','{ORG}','{CUST}','PM-2','measured');
insert into core.quotations (id,organization_id,project_id,number,status)
values ('{QT}','{ORG}','{PRJ}','Q-PM-1','approved');
insert into core.quotation_versions
 (id,organization_id,quotation_id,version_number,status,subtotal_agorot,
  total_agorot,valid_until,created_by,locked,
  sent_at,sent_by,approved_at,decision_recorded_by)
values ('{QV}','{ORG}','{QT}',1,'approved',100000,118000,now() + interval '10 days','{ADMIN}',true,
        now() - interval '1 day','{ADMIN}',now(),'{ADMIN}');
""")
if 'ERROR' in out:
    print(out); sys.exit(1)
print('seeded')

# ── record_payment ───────────────────────────────────────────────────────────
out = as_user(SALES, f"""select api.record_payment(
  '{PRJ2}'::uuid, 50000, 'deposit', 'cash', '{key(1)}'::uuid)::text;""")
check('01 لا دفعة قبل عرض معتمد → BD409 (§11)',
      'BD409' in out or 'قبل اعتماد الزبون' in out, out)

out = as_user(SALES, f"""select api.record_payment(
  '{PRJ}'::uuid, 50000, 'deposit', 'cash', '{key(2)}'::uuid, 'وصل 17', 'عربون')::text;""")
PAY = grab(r'"payment_id"\s*:\s*"([0-9a-f-]+)"', out)
check('02 دفعة نقدية على عرض معتمد تمرّ', PAY is not None and 'ERROR' not in out, out)

out = as_user(SALES, f"""select api.record_payment(
  '{PRJ}'::uuid, 50050, 'deposit', 'cash', '{key(3)}'::uuid)::text;""")
check('03 أغورة في المبلغ → BD400', 'لا أغورة' in out, out)

out = as_user(T1, f"""select api.record_payment(
  '{PRJ}'::uuid, 50000, 'deposit', 'cash', '{key(4)}'::uuid)::text;""")
check('04 الخياط لا يسجّل دفعات → BD403', 'BD403' in out or 'دورك' in out, out)

# ── record_check_series ──────────────────────────────────────────────────────
out = as_user(ADMIN, f"""select api.record_check_series(
  '{PRJ}'::uuid,
  '[{{"amount_agorot": 30000, "due_at": "2026-09-30"}},
    {{"amount_agorot": 30000, "due_at": "2026-10-31"}},
    {{"amount_agorot": 40000, "due_at": "2026-11-30"}}]'::jsonb,
  '{key(5)}'::uuid, 'رزمة أيلول')::text;""")
probe = sql(f"""select string_agg(reference, '|' order by due_at)
 || '#' || count(*) || '#' || sum(amount_agorot)
from core.payments where project_id = '{PRJ}' and method = 'check';""", quiet=False)
check('05 رزمة شيكات: CHK i/N بمواعيدها ومجموعها',
      '"count": 3' in out and 'CHK 1/3|CHK 2/3|CHK 3/3#3#100000' in probe, out + probe)

out = as_user(ADMIN, f"""select api.record_check_series(
  '{PRJ}'::uuid, '[]'::jsonb, '{key(6)}'::uuid)::text;""")
check('06 رزمة فارغة → BD400', 'شيكًا واحدًا' in out, out)

# ── reverse_payment ──────────────────────────────────────────────────────────
out = as_user(ADMIN, f"""select api.reverse_payment(
  '{PAY}'::uuid, 'خطأ في المبلغ', '{key(7)}'::uuid)::text;""")
REV = grab(r'"payment_id"\s*:\s*"([0-9a-f-]+)"', out)
probe = sql(f"""select amount_agorot || '|' || kind || '|' || reversed_payment_id
from core.payments where id = '{REV}';""", quiet=False)
check('07 العكس قيدٌ سالب مرتبط بأصله',
      REV is not None and f'-50000|reversal|{PAY}' in probe, out + probe)

out = as_user(ADMIN, f"""select api.reverse_payment(
  '{PAY}'::uuid, 'مكرر', '{key(8)}'::uuid)::text;""")
check('08 الدفعة لا تُعكس مرتين → BD409', 'BD409' in out or 'معكوسة بالفعل' in out, out)

out = as_user(ADMIN, f"""select api.reverse_payment(
  '{REV}'::uuid, 'عكس العكس', '{key(9)}'::uuid)::text;""")
check('09 قيد العكس لا يُعكس → BD409', 'BD409' in out or 'لا يُعكس' in out, out)

# ── record_staff_payout ──────────────────────────────────────────────────────
out = as_user(ADMIN, f"""select api.record_staff_payout(
  '{T1}'::uuid, 150000, '{key(10)}'::uuid, 'دفعة أسبوعية')::text;""")
probe = sql(f"""select
  (select count(*) from core.staff_ledger
   where organization_id = '{ORG}' and staff_id = '{T1}' and amount_agorot = 150000)
 || '|' ||
  (select count(*) from core.notifications
   where organization_id = '{ORG}' and user_id = '{T1}' and kind = 'payment');""", quiet=False)
check('10 دفعة موظف: القيد في الدفتر والإشعار لصاحبه',
      'ERROR' not in out and '1|1' in probe, out + probe)

out = as_user(SALES, f"""select api.record_staff_payout(
  '{T1}'::uuid, 50000, '{key(11)}'::uuid)::text;""")
check('11 دفعات الطاقم للأدمن وحده → BD403', 'BD403' in out or 'الأدمن وحده' in out, out)

# note وحدها: قيمة سليمة القيود، فالرفض لا يكون إلا من محفّز الجمود
out = sql(f"""update core.staff_ledger set note = 'محاولة تعديل'
 where organization_id = '{ORG}';""", quiet=False)
check('12 الدفتر جامد: التعديل مرفوض بمحفّز الجمود لا بقيود القيمة',
      'ERROR' in out, out)

out = as_user(ADMIN, f"""select api.record_staff_payout(
  '{T1}'::uuid, 150000, '{key(10)}'::uuid, 'دفعة أسبوعية')::text;""")
probe = sql(f"""select 'N=' || count(*) from core.staff_ledger where organization_id = '{ORG}';""", quiet=False)
check('13 الإعادة بنفس المفتاح: was_replayed ولا قيد جديد',
      '"was_replayed": true' in out and 'N=1' in probe, out + probe)

print('\n=== cleanup ===')
sql(PURGE)
print('purged')

print(f'\n===== النتيجة: نجح {len(passed)} / فشل {len(failed)} =====')
if failed:
    for f in failed:
        print('FAILED:', f)
    sys.exit(1)
