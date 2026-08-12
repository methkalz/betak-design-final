"""رأس القمع: save/archive_customer و create/update/status/assign للمشاريع.

الأدوار كما في التطبيق (الميداني يسجّل زبونًا ومشروعًا)، رمز BD-n من
تسلسل المعرض، زيارة القياس تُجدول بإشعارها، والمرآة القديمة
field_worker_id تُروى بالقائس فتصدق سياسات الرؤية.
"""
import sys, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.environ.get('VPS_HELPER_DIR', HERE)
sys.path.insert(0, HELPER)
from vps import run, put_text  # noqa: E402

IID = os.environ.get('BAYTAK_INSTANCE_ID') or open(
    os.path.join(HELPER, 'instance_id.txt')).read().strip()
DB = os.environ.get('BAYTAK_DB_CONTAINER') or f'supabase-db-{IID}'

ORG   = 'cccc7777-0000-4000-8000-000000000001'
ADMIN = 'cccc7777-0000-4000-8000-0000000000a1'
SALES = 'cccc7777-0000-4000-8000-0000000000a2'
F1    = 'cccc7777-0000-4000-8000-0000000000a3'
F2    = 'cccc7777-0000-4000-8000-0000000000a4'  # ميداني ثانٍ نشط
F3    = 'cccc7777-0000-4000-8000-0000000000a5'  # ميداني معطَّل
T1    = 'cccc7777-0000-4000-8000-0000000000a6'


def key(n): return f'cccc7777-0000-4000-8000-00000000ee{n:02d}'


passed, failed = [], []


def sql(text, quiet=True):
    put_text(text + '\n', '/tmp/crud.sql')
    return run(f'docker exec -i {DB} psql -U postgres {"-q" if quiet else ""} < /tmp/crud.sql 2>&1')


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
delete from core.field_visits        where organization_id = '{ORG}';
delete from core.document_sequences  where organization_id = '{ORG}';
delete from core.projects            where organization_id = '{ORG}';
delete from core.customers           where organization_id = '{ORG}';
delete from core.organization_members where organization_id = '{ORG}';
delete from core.business_settings   where organization_id = '{ORG}';
delete from core.organizations       where id = '{ORG}';
delete from core.profiles            where id in ('{ADMIN}','{SALES}','{F1}','{F2}','{F3}','{T1}');
delete from auth.users               where id in ('{ADMIN}','{SALES}','{F1}','{F2}','{F3}','{T1}');
set session_replication_role = origin;
"""

print('=== seeding ===')
users = ",\n ".join(
    f"('{u}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','crud{i}@t.local','x',now(),now(),now())"
    for i, u in enumerate([ADMIN, SALES, F1, F2, F3, T1]))
out = sql(PURGE + f"""
insert into core.organizations (id,name) values ('{ORG}','رأس القمع');
insert into core.business_settings (organization_id) values ('{ORG}');
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,
                        email_confirmed_at,created_at,updated_at) values
 {users};
insert into core.profiles (id,full_name) values
 ('{ADMIN}','أدمن القمع'), ('{SALES}','بائع القمع'), ('{F1}','قائس أول'),
 ('{F2}','قائس ثانٍ'), ('{F3}','ميداني معطَّل'), ('{T1}','خياط القمع');
insert into core.organization_members (organization_id,user_id,role,is_active) values
 ('{ORG}','{ADMIN}','admin',true), ('{ORG}','{SALES}','sales',true),
 ('{ORG}','{F1}','field',true), ('{ORG}','{F2}','field',true),
 ('{ORG}','{F3}','field',false), ('{ORG}','{T1}','tailor',true);
""")
if 'ERROR' in out:
    print(out); sys.exit(1)
print('seeded')

# ── الزبائن ──────────────────────────────────────────────────────────────────
out = as_user(SALES, f"""select api.save_customer(
  'زبون الاختبار', '052-6444414', '{key(1)}'::uuid)::text;""")
CUST = grab(r'"customer_id"\s*:\s*"([0-9a-f-]+)"', out)
check('01 البائع ينشئ زبونًا', CUST is not None and '"created": true' in out, out)

out = as_user(F1, f"""select api.save_customer(
  'زبون الميداني', '0526444415', '{key(2)}'::uuid)::text;""")
check('02 الميداني ينشئ زبونًا (صلاحية التطبيق نفسها)',
      'ERROR' not in out and '"created": true' in out, out)

out = as_user(T1, f"""select api.save_customer(
  'زبون الخياط', '0526444416', '{key(3)}'::uuid)::text;""")
check('03 الخياط لا ينشئ زبائن → BD403', 'BD403' in out or 'دورك' in out, out)

out = as_user(SALES, f"""select api.save_customer(
  'قص', '0526444417', '{key(4)}'::uuid)::text;""")
ok1 = 'قصير جدًا' in out
out = as_user(SALES, f"""select api.save_customer(
  'زبون هاتفه خطأ', '12345', '{key(5)}'::uuid)::text;""")
check('04 اسم قصير ورقم هاتف فاسد → BD400', ok1 and 'غير صالح' in out, out)

out = as_user(SALES, f"""select api.save_customer(
  'زبون الاختبار المعدل', '052-6444414', '{key(6)}'::uuid, '{CUST}'::uuid, 'كفرمندا', 'الشارع الرئيسي')::text;""")
probe = sql(f"""select full_name || '|' || city from core.customers where id = '{CUST}';""", quiet=False)
check('05 التعديل بنفس الدالة يحفظ الحقول',
      'ERROR' not in out and 'زبون الاختبار المعدل|كفرمندا' in probe, out + probe)

out = as_user(SALES, f"""select api.save_customer(
  'زبون الاختبار', '052-6444414', '{key(1)}'::uuid)::text;""")
probe = sql(f"""select count(*) from core.customers where organization_id = '{ORG}';""", quiet=False)
check('06 إعادة مفتاح الإنشاء: was_replayed ولا زبون جديد',
      '"was_replayed": true' in out and re.search(r'\b2\b', probe), out + probe)

# ── المشاريع ─────────────────────────────────────────────────────────────────
out = as_user(SALES, f"""select api.create_project(
  '{CUST}'::uuid, 'ستائر بيت الاختبار', '{T1}'::uuid, '{F1}'::uuid,
  '{key(7)}'::uuid, 'high', null, now() + interval '2 days', 'ملاحظة')::text;""")
PRJ = grab(r'"project_id"\s*:\s*"([0-9a-f-]+)"', out)
VISIT = grab(r'"visit_id"\s*:\s*"([0-9a-f-]+)"', out)
check('07 إنشاء مشروع: BD-1001 وبانتظار القياس وزيارة مجدولة',
      PRJ is not None and '"code": "BD-1001"' in out
      and '"status": "awaiting_measurement"' in out and VISIT is not None, out)

probe = sql(f"""select p.field_worker_id || '|' || p.measurement_worker_id || '|' || p.tailor_id
 || '#' || (select count(*) from core.field_visits
            where project_id = '{PRJ}' and assignee_id = '{F1}' and status = 'scheduled')
 || '#' || (select count(*) from core.notifications
            where organization_id = '{ORG}' and user_id = '{F1}' and kind = 'visit_assigned')
from core.projects p where p.id = '{PRJ}';""", quiet=False)
check('08 المرآة القديمة تُروى بالقائس، والزيارة والإشعار قائمان',
      f'{F1}|{F1}|{T1}#1#1' in probe, probe)

out = as_user(SALES, f"""select api.create_project(
  '{CUST}'::uuid, 'مشروع ثانٍ', '{T1}'::uuid, '{F1}'::uuid, '{key(8)}'::uuid)::text;""")
check('09 التسلسل لا يعيد العد: BD-1002 وبلا موعدٍ لا زيارة',
      '"code": "BD-1002"' in out and '"status": "new_request"' in out
      and '"visit_id": null' in out, out)

out = as_user(SALES, f"""select api.create_project(
  '{CUST}'::uuid, 'مشروع بلا خياط', '{F1}'::uuid, '{F1}'::uuid, '{key(9)}'::uuid)::text;""")
check('10 الخياط إلزامي: ميداني مكانه → BD422', 'BD422' in out or 'إلزامي' in out, out)

out = as_user(SALES, f"""select api.update_project(
  '{PRJ}'::uuid, '{key(10)}'::uuid, 'ستائر بيت الاختبار الكبير', null, null,
  null, now() + interval '20 days', 1)::text;""")
probe = sql(f"""select title || '|' || lock_version
 || '|' || coalesce(to_char(installation_date, 'YYYY'), '-')
 || '|' || to_char(measurement_date, 'YYYY')
from core.projects where id = '{PRJ}';""", quiet=False)
check('11 التعديل: العنوان وموعد التركيب يتغيران والقياس يبقى والنسخة تقفز',
      'ERROR' not in out and 'ستائر بيت الاختبار الكبير|2' in probe
      and '|-|' not in probe, out + probe)

out = as_user(SALES, f"""select api.update_project(
  '{PRJ}'::uuid, '{key(11)}'::uuid, 'عنوان متأخر', null, null, null, null, 1)::text;""")
check('12 نسخة قديمة → BD409 تعارض', 'BD409' in out or 'أعد التحميل' in out, out)

out = as_user(SALES, f"""select api.set_project_status(
  '{PRJ}'::uuid, 'ready_for_install', '{key(12)}'::uuid)::text;""")
check('13 حالة المشروع بيد الأدمن وحده → BD403 للبائع',
      'BD403' in out or 'صلاحية الأدمن' in out, out)

out = as_user(ADMIN, f"""select api.set_project_status(
  '{PRJ}'::uuid, 'ready_for_install', '{key(13)}'::uuid)::text;""")
probe = sql(f"""select p.status_code || '#' ||
  (select count(*) from core.notifications
   where organization_id = '{ORG}' and user_id = '{F1}' and kind = 'ready_for_install')
from core.projects p where p.id = '{PRJ}';""", quiet=False)
check('14 «جاهز للتركيب»: الحالة تتغير والإشعار يبلغ القائس (لا مركّب بعد)',
      'ERROR' not in out and 'ready_for_install#1' in probe, out + probe)

out = as_user(ADMIN, f"""select api.assign_project_role(
  '{PRJ}'::uuid, '{F3}'::uuid, 'measurement', '{key(14)}'::uuid)::text;""")
check('15 إسناد لميداني معطَّل → BD422', 'BD422' in out or 'مفعَّلًا' in out, out)

out = as_user(ADMIN, f"""select api.assign_project_role(
  '{PRJ}'::uuid, '{F2}'::uuid, 'measurement', '{key(15)}'::uuid)::text;""")
probe = sql(f"""select p.measurement_worker_id || '|' || p.field_worker_id
 || '#' || (select assignee_id from core.field_visits where id = '{VISIT}')
from core.projects p where p.id = '{PRJ}';""", quiet=False)
check('16 تبديل القائس: العمودان والزيارة المفتوحة تتبعه',
      'ERROR' not in out and f'{F2}|{F2}#{F2}' in probe, out + probe)

out = as_user(ADMIN, f"""select api.assign_project_role(
  '{PRJ}'::uuid, '{F2}'::uuid, 'installation', '{key(16)}'::uuid)::text;""")
probe = sql(f"""select installer_id from core.projects where id = '{PRJ}';""", quiet=False)
check('17 إسناد المركّب يكتب عموده', 'ERROR' not in out and F2 in probe, out + probe)

out = as_user(ADMIN, f"""select api.assign_project_role(
  '{PRJ}'::uuid, '{T1}'::uuid, 'tailor', '{key(17)}'::uuid)::text;""")
probe = sql(f"""select p.tailor_id || '#' ||
  (select count(*) from core.notifications
   where organization_id = '{ORG}' and user_id = '{T1}' and kind = 'tailor_assignment')
from core.projects p where p.id = '{PRJ}';""", quiet=False)
check('18 إسناد الخياطة: العمود والإشعار', 'ERROR' not in out and f'{T1}#1' in probe, out + probe)

out = as_user(SALES, f"""select api.archive_customer(
  '{CUST}'::uuid, '{key(18)}'::uuid)::text;""")
probe = sql(f"""select (archived_at is not null)::text from core.customers where id = '{CUST}';""", quiet=False)
check('19 الأرشفة تختم ولا تحذف', 'ERROR' not in out and 'true' in probe, out + probe)

print('\n=== cleanup ===')
sql(PURGE)
print('purged')

print(f'\n===== النتيجة: نجح {len(passed)} / فشل {len(failed)} =====')
if failed:
    for f in failed:
        print('FAILED:', f)
    sys.exit(1)
