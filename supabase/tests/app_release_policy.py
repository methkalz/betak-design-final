"""سياسة إصدارات المتجر: كلّ داخلٍ يقرأ، والأدمن وحده يضبط، وanon لا يرى شيئًا.

الجدول عامٌّ (صفٌّ لكلّ منصّة)، فالمجموعة تعيده إلى الصفر في آخرها.
"""
import sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.environ.get('VPS_HELPER_DIR', HERE)
sys.path.insert(0, HELPER)
from vps import run, put_text  # noqa: E402

IID = os.environ.get('BAYTAK_INSTANCE_ID') or open(
    os.path.join(HELPER, 'instance_id.txt')).read().strip()
DB = os.environ.get('BAYTAK_DB_CONTAINER') or f'supabase-db-{IID}'

ORG = 'ffffcccc-0000-4000-8000-000000000001'
A = 'ffffcccc-0000-4000-8000-0000000000a1'   # أدمن
T = 'ffffcccc-0000-4000-8000-0000000000a2'   # خياط
ORG2 = 'ffffcccc-0000-4000-8000-000000000002'  # محلٌّ ثانٍ لا يملك الإصدارات (كالتجريبيّ)
A2 = 'ffffcccc-0000-4000-8000-0000000000a3'   # أدمنه

passed, failed = [], []


def sql(text, quiet=True):
    put_text(text + '\n', '/tmp/release.sql')
    return run(f'docker exec -i {DB} psql -U postgres {"-q" if quiet else ""} < /tmp/release.sql 2>&1')


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
        print('      ' + detail.strip().replace('\n', '\n      ')[:600])


RESET = """update core.app_release_policy set latest_build = 0, min_build = 0, ios_app_store_id = null,
  updated_by = null where platform in ('ios','android');"""

PURGE = f"""
set session_replication_role = replica;
{RESET}
delete from core.audit_logs           where organization_id in ('{ORG}','{ORG2}');
delete from core.organization_members where organization_id in ('{ORG}','{ORG2}');
delete from core.business_settings    where organization_id in ('{ORG}','{ORG2}');
delete from core.organizations        where id in ('{ORG}','{ORG2}');
delete from core.profiles             where id in ('{A}','{T}','{A2}');
delete from auth.users                where id in ('{A}','{T}','{A2}');
set session_replication_role = origin;
"""

print('=== seeding ===')
users = ",\n ".join(
    f"('{u}','00000000-0000-0000-0000-000000000000','authenticated','authenticated',"
    f"'rel{i}@t.local','x',now(),now(),now())" for i, u in enumerate([A, T, A2]))
out = sql(PURGE + f"""
insert into core.organizations (id,name,manages_app_releases) values
 ('{ORG}','معرض الإصدارات',true), ('{ORG2}','معرض المراجعة',false);
insert into core.business_settings (organization_id) values ('{ORG}'), ('{ORG2}');
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,
                        email_confirmed_at,created_at,updated_at) values
 {users};
insert into core.profiles (id,full_name,phone) values
 ('{A}','أدمن الإصدارات','054-0000201'), ('{T}','خياط الإصدارات','054-0000202'),
 ('{A2}','أدمن المراجعة','054-0000203');
insert into core.organization_members (organization_id,user_id,role,is_active) values
 ('{ORG}','{A}','admin',true), ('{ORG}','{T}','tailor',true), ('{ORG2}','{A2}','admin',true);
""")
if 'ERROR' in out:
    print(out); sys.exit(1)
print('seeded')

out = as_user(T, "select api.app_release_policy('android')::text;")
check('01 كلّ داخلٍ يقرأ السياسة: أرقامٌ وحدها، صفرٌ افتراضيًّا',
      '"min_build": 0' in out and '"latest_build": 0' in out and 'ios_app_store_id' in out, out)

out = sql("set role anon;\nselect api.app_release_policy('android')::text;", quiet=False)
check('02 anon لا يقرأ شيئًا - مخطّط api مغلقٌ عليه', 'ERROR' in out and 'permission denied' in out, out)

out = as_user(T, "select api.set_app_release_policy('android', 5, 1)::text;")
check('03 غير الأدمن لا يضبط → BD403', 'ERROR' in out and 'للأدمن وحده' in out, out)

out = as_user(A, "select api.set_app_release_policy('android', 12, 10)::text;")
read = as_user(T, "select api.app_release_policy('android')::text;")
check('04 الأدمن يضبط، والقراءة تعكس الأرقام',
      'ERROR' not in out and '"latest_build": 12' in read and '"min_build": 10' in read, out + read)

o1 = as_user(A, "select api.set_app_release_policy('android', 5, 6)::text;")
o2 = as_user(A, "select api.set_app_release_policy('android', 5, -1)::text;")
o3 = as_user(A, "select api.set_app_release_policy('windows', 5, 1)::text;")
check('05 الحدّ الأدنى لا يتجاوز الأحدث ولا ينزل تحت الصفر، والمنصّة ios أو android',
      all('ERROR' in o for o in (o1, o2, o3)) and 'المنصّة' in o3, o1 + o2 + o3)

bad = as_user(A, "select api.set_app_release_policy('ios', 3, 0, 'abc')::text;")
good = as_user(A, "select api.set_app_release_policy('ios', 3, 0, '1234567890')::text;")
as_user(A, "select api.set_app_release_policy('android', 12, 10, '999999999')::text;")
ios = as_user(T, "select api.app_release_policy('ios')::text;")
check('06 معرّف App Store أرقامٌ فقط، ويُحفظ على iOS وحده',
      'ERROR' in bad and 'ERROR' not in good and '"ios_app_store_id": "1234567890"' in ios, bad + good + ios)

audit = sql(f"select count(*) from core.audit_logs where organization_id = '{ORG}' and action = 'settings.app_release';", quiet=False)
check('07 كلّ ضبطٍ ناجحٍ يُكتب في التدقيق', '\n     3\n' in audit or ' 3\n' in audit, audit)

out = as_user(A2, "select api.set_app_release_policy('android', 99, 99)::text;")
read = as_user(T, "select api.app_release_policy('android')::text;")
check('08 أدمن محلٍّ لا يملك الإصدارات (كالمراجِع) لا يغيّر السياسة العامّة',
      'ERROR' in out and 'المحلّ المالك' in out and '"min_build": 99' not in read, out + read)

view = as_user(A2, "select manages_app_releases::text from api.organization;")
check('09 التطبيق يقرأ علم المحلّ ليُخفي الشاشة', 'false' in view and 'ERROR' not in view, view)

print('\n=== cleanup ===')
sql(PURGE)

print(f'\n{len(passed)} passed, {len(failed)} failed')
if failed:
    for f in failed:
        print('  FAIL', f)
    sys.exit(1)
