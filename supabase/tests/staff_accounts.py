"""بوابة حسابات الطاقم: بابٌ واحد للإنشاء، وسقفُ الدور على الصلاحيات.

إنشاء حساب دخولٍ يمسّ auth.users، وعقد GoTrue خفيّ: أعمدة رموزٍ لا تقبل
NULL عند القراءة، وصفُّ هويةٍ لكل حساب - حسابٌ ناقصهما «يبدو سليمًا» ويُخفق
الدخول بغموض. هذه المجموعة تثبت العقد كاملًا، وتثبت قاعدة السقف: الأدمن
يُطفئ ما يملكه الدور، وما فوقه يُرفض - رفعُه طريقُه رفعُ الدور.
"""
import sys, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.environ.get('VPS_HELPER_DIR', HERE)
sys.path.insert(0, HELPER)
from vps import run, put_text  # noqa: E402

IID = os.environ.get('BAYTAK_INSTANCE_ID') or open(
    os.path.join(HELPER, 'instance_id.txt')).read().strip()
DB = os.environ.get('BAYTAK_DB_CONTAINER') or f'supabase-db-{IID}'

ORG = 'ffffaaaa-0000-4000-8000-000000000001'
ADMIN = 'ffffaaaa-0000-4000-8000-0000000000a1'
T1 = 'ffffaaaa-0000-4000-8000-0000000000a2'

UUID_RE = r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'


def key(n):
    return f'ffffaaaa-0000-4000-8000-00000000ee{n:02d}'


passed, failed = [], []


def sql(text, quiet=True):
    put_text(text + '\n', '/tmp/staffacct.sql')
    return run(f'docker exec -i {DB} psql -U postgres {"-q" if quiet else ""} < /tmp/staffacct.sql 2>&1')


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


def grab(pattern, text):
    m = re.search(pattern, text)
    return m.group(1) if m else None


PURGE = f"""
set session_replication_role = replica;
delete from core.client_operations    where organization_id = '{ORG}';
delete from core.audit_logs           where organization_id = '{ORG}';
delete from core.notifications        where organization_id = '{ORG}';
delete from auth.identities where user_id in
  (select user_id from core.organization_members where organization_id = '{ORG}');
delete from auth.users where id in
  (select user_id from core.organization_members where organization_id = '{ORG}');
delete from core.profiles where id in
  (select user_id from core.organization_members where organization_id = '{ORG}');
delete from core.organization_members where organization_id = '{ORG}';
delete from core.business_settings    where organization_id = '{ORG}';
delete from core.organizations        where id = '{ORG}';
delete from core.profiles             where id in ('{ADMIN}','{T1}');
delete from auth.users                where id in ('{ADMIN}','{T1}');
delete from auth.users                where email = '972540001112@baytak.local';
set session_replication_role = origin;
"""

print('=== seeding ===')
users = ",\n ".join(
    f"('{u}','00000000-0000-0000-0000-000000000000','authenticated','authenticated',"
    f"'sa{i}@t.local','x',now(),now(),now())"
    for i, u in enumerate([ADMIN, T1]))
out = sql(PURGE + f"""
insert into core.organizations (id,name) values ('{ORG}','معرض الحسابات');
insert into core.business_settings (organization_id) values ('{ORG}');
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,
                        email_confirmed_at,created_at,updated_at) values
 {users};
insert into core.profiles (id,full_name,phone) values
 ('{ADMIN}','أدمن الحسابات','054-0000001'), ('{T1}','خياط الحسابات','054-0000002');
insert into core.organization_members (organization_id,user_id,role,is_active) values
 ('{ORG}','{ADMIN}','admin',true), ('{ORG}','{T1}','tailor',true);
""")
if 'ERROR' in out:
    print(out); sys.exit(1)
print('seeded')

# ── ١) الإنشاء من بابه ──────────────────────────────────────────────────────
out = as_user(ADMIN, f"""select api.create_staff(
  'بائع الاختبار', '054-0001112', 'sales', 'sifr1234', '{key(1)}'::uuid, 'مبيعات')::text;""")
NEW = grab(r'"user_id"\s*:\s*"([0-9a-f-]+)"', out)
check('01 الأدمن ينشئ موظفًا ويستلم معرّفه',
      'ERROR' not in out and NEW is not None and '"phone": "054-0001112"' in out, out)

probe = sql(f"""select 'email=' || u.email
 || '|tok=' || (coalesce(u.confirmation_token,'X') || coalesce(u.recovery_token,'X')
                || coalesce(u.email_change,'X') || coalesce(u.reauthentication_token,'X'))
 || '|ident=' || (select count(*) from auth.identities i where i.user_id = u.id)
 || '|role=' || (select om.role::text from core.organization_members om where om.user_id = u.id)
 || '|conf=' || (u.email_confirmed_at is not null)::text
 from auth.users u where u.id = '{NEW}';""", quiet=False)
check('02 عقد GoTrue كاملًا: بريد 972، رموز فارغة لا NULL، صف هوية، مؤكَّد',
      'email=972540001112@baytak.local|tok=|ident=1|role=sales|conf=true' in probe, probe)

probe = sql(f"""select 'pw=' || (u.encrypted_password =
  extensions.crypt('sifr1234', u.encrypted_password))::text
 from auth.users u where u.id = '{NEW}';""", quiet=False)
check('03 كلمة السر تُبصم بـbcrypt وتصدُق عند التحقق', 'pw=true' in probe, probe)

out = as_user(ADMIN, f"""select api.create_staff(
  'بائع الاختبار', '054-0001112', 'sales', 'sifr1234', '{key(1)}'::uuid, 'مبيعات')::text;""")
probe = sql(f"""select count(*) from auth.users where email = '972540001112@baytak.local';""",
            quiet=False)
check('04 إعادة المفتاح: was_replayed ولا حساب ثانٍ',
      '"was_replayed": true' in out and re.search(r'^\s*1\s*$', probe, re.M) is not None, out + probe)

out = as_user(ADMIN, f"""select api.create_staff(
  'مكرر الرقم', '0540001112', 'field', 'sifr1234', '{key(2)}'::uuid)::text;""")
check('05 الرقم المكرر (ولو بصيغة أخرى) → مرفوض', 'ERROR' in out and 'بهذا الرقم' in out, out)

out = as_user(ADMIN, f"""select api.create_staff(
  'رقم فاسد', '12345', 'field', 'sifr1234', '{key(3)}'::uuid)::text;""")
ok1 = 'ERROR' in out and 'غير صالح' in out
out = as_user(ADMIN, f"""select api.create_staff(
  'سر قصير', '054-0001113', 'field', '12', '{key(4)}'::uuid)::text;""")
check('06 رقم فاسد وسرّ قصير → مرفوضان', ok1 and 'ERROR' in out and 'أربعة' in out, out)

out = as_user(T1, f"""select api.create_staff(
  'دخيل', '054-0001114', 'field', 'sifr1234', '{key(5)}'::uuid)::text;""")
check('07 غير الأدمن لا ينشئ حسابات → BD403',
      'ERROR' in out and 'الأدمن وحده' in out, out)

# ── ٢) الصلاحيات: سقف الدور ────────────────────────────────────────────────
out = as_user(ADMIN, f"""select api.set_staff_capability(
  '{NEW}'::uuid, 'record_payment', false, '{key(6)}'::uuid)::text;""")
probe = as_user(ADMIN, f"""select 'ov=' || capability_overrides::text
 from api.team_members where user_id = '{NEW}';""")
check('08 إيقاف صلاحيةٍ يملكها الدور → يُخزَّن ويصل العرض',
      'ERROR' not in out and '"record_payment": false' in probe, out + probe)

out = as_user(ADMIN, f"""select api.set_staff_capability(
  '{T1}'::uuid, 'record_payment', true, '{key(7)}'::uuid)::text;""")
check('09 منحٌ فوق سقف الدور (دفعة لخياط) → مرفوض',
      'ERROR' in out and ('لا يملك' in out or 'BD422' in out), out)

out = as_user(ADMIN, f"""select api.set_staff_capability(
  '{ADMIN}'::uuid, 'manage_users', false, '{key(8)}'::uuid)::text;""")
check('10 الأدمن لا يُطفئ صلاحيات نفسه', 'ERROR' in out, out)

out = as_user(ADMIN, f"""select api.set_staff_capability(
  '{NEW}'::uuid, 'record_payment', true, '{key(9)}'::uuid)::text;""")
probe = as_user(ADMIN, f"""select 'ov=' || capability_overrides::text
 from api.team_members where user_id = '{NEW}';""")
check('11 السماح = محو الإيقاف لا تخزين منح', 'ov={}' in probe, out + probe)

# ── ٣) الدور: سقفٌ جديد يمحو إيقافات القديم ────────────────────────────────
as_user(ADMIN, f"""select api.set_staff_capability(
  '{NEW}'::uuid, 'create_quotation', false, '{key(10)}'::uuid)::text;""")
out = as_user(ADMIN, f"""select api.set_staff_role(
  '{NEW}'::uuid, 'field', '{key(11)}'::uuid)::text;""")
probe = sql(f"""select 'role=' || om.role::text || '|ov=' || om.capability_overrides::text
 from core.organization_members om where om.user_id = '{NEW}';""", quiet=False)
check('12 تغيير الدور يسري ويمحو إيقافات الدور السابق',
      'ERROR' not in out and 'role=field|ov={}' in probe, out + probe)

out = as_user(ADMIN, f"""select api.set_staff_role(
  '{ADMIN}'::uuid, 'sales', '{key(12)}'::uuid)::text;""")
check('13 الأدمن لا يخفض نفسه - لا معرض بلا إدارة', 'ERROR' in out, out)

# ── ٤) التعطيل يقفل الباب ──────────────────────────────────────────────────
sql(f"""insert into auth.sessions (id, user_id, created_at, updated_at)
 values (gen_random_uuid(), '{NEW}', now(), now());""")
out = as_user(ADMIN, f"""select api.set_staff_active(
  '{NEW}'::uuid, false, '{key(13)}'::uuid)::text;""")
probe = sql(f"""select 'active=' || om.is_active::text
 || '|banned=' || (u.banned_until is not null)::text
 || '|sessions=' || (select count(*) from auth.sessions s where s.user_id = '{NEW}')
 from core.organization_members om join auth.users u on u.id = om.user_id
 where om.user_id = '{NEW}';""", quiet=False)
check('14 التعطيل: عضويةٌ موقوفة وحظرٌ في auth وجلساتٌ ممحوّة',
      'ERROR' not in out and 'active=false|banned=true|sessions=0' in probe, out + probe)

out = as_user(ADMIN, f"""select api.set_staff_active(
  '{ADMIN}'::uuid, false, '{key(14)}'::uuid)::text;""")
check('15 الأدمن لا يعطّل نفسه', 'ERROR' in out, out)

out = as_user(ADMIN, f"""select api.set_staff_active(
  '{NEW}'::uuid, true, '{key(15)}'::uuid)::text;""")
probe = sql(f"""select 'banned=' || (banned_until is not null)::text
 from auth.users where id = '{NEW}';""", quiet=False)
check('16 إعادة التفعيل ترفع الحظر', 'ERROR' not in out and 'banned=false' in probe, out + probe)

# ── ٥) كلمة السر ───────────────────────────────────────────────────────────
out = as_user(ADMIN, f"""select api.reset_staff_password(
  '{NEW}'::uuid, 'jadid99', '{key(16)}'::uuid)::text;""")
probe = sql(f"""select 'new=' || (u.encrypted_password =
  extensions.crypt('jadid99', u.encrypted_password))::text
 || '|old=' || (u.encrypted_password = extensions.crypt('sifr1234', u.encrypted_password))::text
 from auth.users u where u.id = '{NEW}';""", quiet=False)
check('17 تبديل السر: الجديد يصدُق والقديم لا', 'new=true|old=false' in probe, out + probe)

# ── ٦) مرآة المصفوفة تطابق التطبيق (عيّنات حدّية) ─────────────────────────
probe = sql("""select 'm=' ||
 private.capability_can('sales','record_payment')::text || ',' ||
 private.capability_can('sales','approve_discount')::text || ',' ||
 private.capability_can('field','install')::text || ',' ||
 private.capability_can('field','record_payment')::text || ',' ||
 private.capability_can('tailor','receive_own_fabric')::text || ',' ||
 private.capability_can('admin','manage_users')::text;""", quiet=False)
check('18 مرآة المصفوفة في القاعدة تطابق التطبيق',
      'm=true,false,true,false,true,true' in probe, probe)

# ── ٧) تصويبات ذيل التدقيق ─────────────────────────────────────────────────
out = as_user(ADMIN, f"""select api.set_staff_active(
  '{T1}'::uuid, null, '{key(20)}'::uuid)::text;""")
check('19 NULL في التفعيل → خطأ نظيف لا 23502 خام',
      'ERROR' in out and ('حدّد' in out or 'BD400' in out) and '23502' not in out, out)

out = as_user(ADMIN, f"""select api.reset_staff_password(
  '{T1}'::uuid, 'kalima9', '{key(21)}'::uuid)::text;""")
probe = sql(f"""select 'leak=' || (payload::text ilike '%pw_hash%'
  or payload::text ilike '%kalima9%')::text
 from core.client_operations where idempotency_key = '{key(21)}';""", quiet=False)
check('20 كلمة السر ولا بصمتها لا تدخل حمولة العملية',
      'ERROR' not in out and 'leak=false' in probe, out + probe)

print('\n=== cleanup ===')
sql(PURGE)
print('purged')

print(f'\n===== النتيجة: نجح {len(passed)} / فشل {len(failed)} =====')
if failed:
    for f in failed:
        print('FAILED:', f)
    sys.exit(1)
