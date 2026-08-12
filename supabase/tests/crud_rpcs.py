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
PROD  = 'cccc7777-0000-4000-8000-0000000000e1'
VAR   = 'cccc7777-0000-4000-8000-0000000000e2'


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
delete from core.tailor_assignments  where organization_id = '{ORG}';
delete from core.field_visits        where organization_id = '{ORG}';
delete from core.windows             where organization_id = '{ORG}';
delete from core.rooms               where organization_id = '{ORG}';
delete from core.fabric_variants     where organization_id = '{ORG}';
delete from core.fabric_products     where organization_id = '{ORG}';
delete from core.document_sequences  where organization_id = '{ORG}';
delete from core.projects            where organization_id = '{ORG}';
delete from core.customers           where organization_id = '{ORG}';
delete from core.organization_members where organization_id = '{ORG}';
delete from core.pricing_rules       where organization_id = '{ORG}';
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
insert into core.fabric_products (id,organization_id,name,kind,width_cm)
values ('{PROD}','{ORG}','قماش القمع','other',280);
insert into core.fabric_variants (id,organization_id,product_id,color_name,sku,cost_per_meter_agorot)
values ('{VAR}','{ORG}','{PROD}','رملي','CR-F',2000);
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
PRJ2 = grab(r'"project_id"\s*:\s*"([0-9a-f-]+)"', out)
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

# ── الغرف والشبابيك ──────────────────────────────────────────────────────────
# PRJ2 التُقط لحظة إنشائه في الفحص 09 - ما زال new_request، وعليه
# يُثبت انتقال «تم القياس»
out = as_user(F1, f"""select api.add_room('{PRJ2}'::uuid, 'صالون', '{key(20)}'::uuid, 'أرضي')::text;""")
ROOM = grab(r'"room_id"\s*:\s*"([0-9a-f-]+)"', out)
check('20 الميداني يضيف غرفة بترتيب 1',
      ROOM is not None and '"sort_order": 1' in out, out)

out = as_user(F1, f"""select api.save_window(
  '{PRJ2}'::uuid, '{ROOM}'::uuid, 300, 280, '{VAR}'::uuid, '{key(21)}'::uuid,
  p_track => 'standard')::text;""")
WIN = grab(r'"window_id"\s*:\s*"([0-9a-f-]+)"', out)
probe = sql(f"""select status_code from core.projects where id = '{PRJ2}';""", quiet=False)
check('21 أول قياس يُنشئ الشباك ويحرّك المشروع «تم القياس»',
      WIN is not None and '"created": true' in out and 'measured' in probe, out + probe)

out = as_user(F1, f"""select api.save_window(
  '{PRJ2}'::uuid, '{ROOM}'::uuid, 300, 280, null, '{key(22)}'::uuid)::text;""")
ok1 = 'اختر القماش' in out
out = as_user(F1, f"""select api.save_window(
  '{PRJ2}'::uuid, '{ROOM}'::uuid, 300, 501, '{VAR}'::uuid, '{key(23)}'::uuid)::text;""")
check('22 بلا قماش أو فوق 500 سم → BD400',
      ok1 and ('500' in out and 'تسعيرة خاصة' in out), out)

out = as_user(F1, f"""select api.save_window(
  '{PRJ2}'::uuid, '{ROOM}'::uuid, 350, 280, '{VAR}'::uuid, '{key(24)}'::uuid,
  '{WIN}'::uuid, 'شباك الصالون الكبير')::text;""")
probe = sql(f"""select name || '|' || width_cm from core.windows where id = '{WIN}';""", quiet=False)
check('23 التعديل بنفس الدالة: الاسم والعرض يتغيران',
      'ERROR' not in out and 'شباك الصالون الكبير|350' in probe, out + probe)

out = as_user(T1, f"""select api.add_room('{PRJ2}'::uuid, 'غرفة الخياط', '{key(25)}'::uuid)::text;""")
check('24 الخياط لا يسجّل قياسات → BD403', 'BD403' in out or 'دورك' in out, out)

out = as_user(F1, f"""select api.delete_window('{WIN}'::uuid, '{key(26)}'::uuid)::text;""")
probe = sql(f"""select count(*) from core.windows where id = '{WIN}';""", quiet=False)
check('25 حذف الشباك قبل الإنتاج يمرّ', 'ERROR' not in out and re.search(r'\b0\b', probe), out + probe)

out = as_user(F1, f"""select api.save_window(
  '{PRJ2}'::uuid, '{ROOM}'::uuid, 200, 250, '{VAR}'::uuid, '{key(27)}'::uuid)::text;""")
out = as_user(F1, f"""select api.delete_room('{ROOM}'::uuid, '{key(28)}'::uuid)::text;""")
probe = sql(f"""select (select count(*) from core.rooms where id = '{ROOM}')
 || '|' || (select count(*) from core.windows where room_id = '{ROOM}');""", quiet=False)
check('26 حذف الغرفة يحذف شبابيكها معها',
      '"deleted_windows": 1' in out and '0|0' in probe, out + probe)

out = as_user(F2, f"""select api.add_room('{PRJ2}'::uuid, 'غرفة دخيلة', '{key(29)}'::uuid)::text;""")
check('27 ميداني غير مسنَد للمشروع -> BD403 خارج النطاق',
      'BD403' in out or 'خارج نطاق' in out, out)

# ── الزيارات الميدانية ───────────────────────────────────────────────────────
# PRJ2 عليه زيارة قياس؟ لا - أُنشئ بلا موعد. تُجدول له الآن ثم تُدار دورتها
out = as_user(ADMIN, f"""select api.schedule_visit(
  '{PRJ2}'::uuid, '{F1}'::uuid, 'measurement', now() + interval '1 day', '{key(30)}'::uuid)::text;""")
FV = grab(r'"visit_id"\s*:\s*"([0-9a-f-]+)"', out)
probe = sql(f"""select count(*) from core.notifications
 where organization_id = '{ORG}' and user_id = '{F1}'
   and kind = 'visit_assigned' and deep_link = '/visit/' || '{FV}';""", quiet=False)
check('28 جدولة زيارة قياس: تُنشأ ويُخطر المسنَد',
      FV is not None and 'ERROR' not in out and re.search(r'\b1\b', probe), out + probe)

out = as_user(ADMIN, f"""select api.schedule_visit(
  '{PRJ2}'::uuid, '{F1}'::uuid, 'measurement', now() + interval '2 days', '{key(31)}'::uuid)::text;""")
check('29 زيارة ثانية من النوع نفسه → BD409', 'BD409' in out or 'مجدولة بالفعل' in out, out)

# الغرفة وشباكها حُذفا في 25-26: يُعاد التسجيل قبل إكمال القياس
out = as_user(F1, f"""select api.add_room('{PRJ2}'::uuid, 'صالون ثانٍ', '{key(38)}'::uuid)::text;""")
ROOM2 = grab(r'"room_id"\s*:\s*"([0-9a-f-]+)"', out)
out = as_user(F1, f"""select api.save_window(
  '{PRJ2}'::uuid, '{ROOM2}'::uuid, 220, 260, '{VAR}'::uuid, '{key(39)}'::uuid)::text;""")
out = as_user(F1, f"""select api.complete_visit('{FV}'::uuid, '{key(32)}'::uuid)::text;""")
probe = sql(f"""select status_code from core.projects where id = '{PRJ2}';""", quiet=False)
check('30 إكمال القياس: المشروع بقي measured (شبابيكه مسجلة سلفًا)',
      'ERROR' not in out and 'measured' in probe, out + probe)

out = as_user(ADMIN, f"""select api.schedule_visit(
  '{PRJ}'::uuid, '{F2}'::uuid, 'installation', now() + interval '3 days', '{key(33)}'::uuid)::text;""")
FV2 = grab(r'"visit_id"\s*:\s*"([0-9a-f-]+)"', out)
out = as_user(F2, f"""select api.start_visit('{FV2}'::uuid, '{key(34)}'::uuid)::text;""")
out2 = as_user(F2, f"""select api.complete_visit('{FV2}'::uuid, '{key(35)}'::uuid)::text;""")
check('31 التركيب لا يُقفل بلا قائمة التحقق → BD422',
      'ERROR' not in out and ('BD422' in out2 or 'قائمة التحقق' in out2), out + out2)

out = as_user(F2, f"""select api.update_visit('{FV2}'::uuid, '{key(36)}'::uuid,
  p_check_track => true, p_check_curtain => true, p_check_height => true,
  p_check_cleanliness => true, p_customer_signed_off => true)::text;""")
out2 = as_user(F2, f"""select api.complete_visit('{FV2}'::uuid, '{key(37)}'::uuid)::text;""")
probe = sql(f"""select status_code from core.projects where id = '{PRJ}';""", quiet=False)
check('32 قائمة كاملة وتوقيع → التركيب يُقفل والمشروع installed',
      'ERROR' not in out and 'ERROR' not in out2 and 'installed' in probe, out + out2 + probe)

# ── أوامر الإنتاج ────────────────────────────────────────────────────────────
out = as_user(ADMIN, f"""select api.assign_tailor(
  '{PRJ2}'::uuid, '{T1}'::uuid, '{key(40)}'::uuid, 'تفصيل حسب المقاسات', now() + interval '5 days')::text;""")
TA = grab(r'"assignment_id"\s*:\s*"([0-9a-f-]+)"', out)
probe = sql(f"""select p.status_code || '|' || p.tailor_id
 || '#' || (select count(*) from core.notifications
            where organization_id = '{ORG}' and user_id = '{T1}'
              and kind = 'tailor_assignment' and deep_link = '/tailor/' || '{TA}')
from core.projects p where p.id = '{PRJ2}';""", quiet=False)
check('33 إسناد الخياط: الأمر يُنشأ والمشروع «مع الخياط» والإشعار يصل',
      TA is not None and f'with_tailor|{T1}#1' in probe, out + probe)

out = as_user(ADMIN, f"""select api.assign_tailor(
  '{PRJ2}'::uuid, '{T1}'::uuid, '{key(41)}'::uuid)::text;""")
check('34 أمر ثانٍ ومشروعه مفتوح → BD409', 'BD409' in out or 'مفتوح' in out, out)

out = as_user(T1, f"""select api.advance_stage('{TA}'::uuid, 'cutting', '{key(42)}'::uuid)::text;""")
probe = sql(f"""select stage || '#' || jsonb_array_length(stage_history)
 || '#' || (started_at is not null)::text
from core.tailor_assignments where id = '{TA}';""", quiet=False)
check('35 الخياط يقدّم مرحلته: cutting وسجلها والبدء مختوم',
      'ERROR' not in out and 'cutting#1#true' in probe, out + probe)

out = as_user(T1, f"""select api.advance_stage('{TA}'::uuid, 'qc', '{key(43)}'::uuid)::text;""")
check('36 القفز فوق المراحل → BD409', 'BD409' in out or 'خطوة واحدة' in out, out)

out = as_user(T1, f"""select api.advance_stage('{TA}'::uuid, 'received', '{key(44)}'::uuid)::text;""")
check('37 الرجوع خطوة مسموح (الضغطة الخاطئة تقع)', 'ERROR' not in out, out)

out = as_user(SALES, f"""select api.advance_stage('{TA}'::uuid, 'cutting', '{key(45)}'::uuid)::text;""")
check('38 البائع لا يقدّم مراحل → BD403', 'BD403' in out or 'خياط الأمر' in out, out)

# «جاهز» ممنوع وفي المشروع شباك بلا تأكيد إنهاء (شباك key 39 بلا استهلاك)
walk_ok = True
for st, kn in [('cutting', 46), ('sewing', 47), ('ironing', 48), ('qc', 49)]:
    out = as_user(T1, f"""select api.advance_stage('{TA}'::uuid, '{st}', '{key(kn)}'::uuid)::text;""")
    walk_ok = walk_ok and 'ERROR' not in out
out = as_user(T1, f"""select api.advance_stage('{TA}'::uuid, 'ready', '{key(50)}'::uuid)::text;""")
check('39 المسير سليم و«جاهز» بلا إنهاء الشبابيك → BD409 بعدّها',
      walk_ok and ('BD409' in out or 'بلا تأكيد إنهاء' in out), out)

out = as_user(ADMIN, f"""select api.assign_tailor(
  '{PRJ}'::uuid, '{T1}'::uuid, '{key(51)}'::uuid)::text;""")
out2 = as_user(ADMIN, f"""select api.assign_tailor(
  '{PRJ}'::uuid, '{T1}'::uuid, '{key(52)}'::uuid)::text;""")
check('40 المشروع الواحد أمرٌ واحد: الثاني يُرفض برسالة مصممة لا 23505',
      'ERROR' not in out and ('BD409' in out2 or 'أمر إنتاج مفتوح' in out2), out + out2)

out = sql(f"""insert into core.pricing_rules
 (organization_id, band, category, customer_price_per_meter_agorot, tailor_cost_per_meter_agorot)
 values ('{ORG}', 'standard', 'other_with_lining', 35000, 4000)
 on conflict (organization_id, band, category) do nothing;""")

# ── الإعدادات والتسعيرة ──────────────────────────────────────────────────────
out = as_user(ADMIN, f"""select api.update_business_settings(
  '{key(60)}'::uuid, p_motor_price_agorot => 95000)::text;""")
probe = sql(f"""select 'M=' || motor_price_agorot || '|T=' || track_cost_per_meter_agorot
 from core.business_settings where organization_id = '{ORG}';""", quiet=False)
check('41 رقعة إعداد واحد: الماتور يتغير وسواه يبقى',
      'ERROR' not in out and 'M=95000|T=1000' in probe, out + probe)

out = as_user(SALES, f"""select api.update_business_settings(
  '{key(61)}'::uuid, p_motor_price_agorot => 1)::text;""")
check('42 التسعيرة للأدمن وحده → BD403', 'BD403' in out or 'الأدمن وحده' in out, out)

out = as_user(ADMIN, f"""select api.update_business_settings(
  '{key(62)}'::uuid, p_employee_discount_limit_percent => 50,
  p_admin_discount_limit_percent => 10)::text;""")
check('43 سقف الموظف فوق سقف الأدمن → BD400 برسالة مصممة',
      'BD400' in out or 'لا يتجاوز' in out, out)

# مسار الدمج الحقيقي: معامل واحد يُدمج مع المخزون (موظف 5 / أدمن 10 افتراضًا)
out = as_user(ADMIN, f"""select api.update_business_settings(
  '{key(64)}'::uuid, p_admin_discount_limit_percent => 4)::text;""")
check('44 خفض سقف الأدمن تحت سقف الموظف المخزون → BD400 عبر الدمج',
      'BD400' in out or 'لا يتجاوز' in out, out)

out = as_user(ADMIN, f"""select api.update_business_settings(
  '{key(65)}'::uuid, p_employee_discount_limit_percent => 8)::text;""")
probe = sql(f"""select 'E=' || employee_discount_limit_percent || '|A=' || admin_discount_limit_percent
 from core.business_settings where organization_id = '{ORG}';""", quiet=False)
check('45 رفع سقف الموظف ضمن سقف الأدمن المخزون يمر عبر الدمج',
      'ERROR' not in out and 'E=8.00|A=10.00' in probe, out + probe)

# عقد الإعادة يصمد أمام تغيّر الحالة اللاحق: الرد المفقود يستعيد نتيجته
# المسجلة لا BD400 من حارسٍ صارت حالتُه تناقض المدخلات القديمة
out = as_user(ADMIN, f"""select api.update_business_settings(
  '{key(66)}'::uuid, p_employee_discount_limit_percent => 4,
  p_admin_discount_limit_percent => 5)::text;""")
out2 = as_user(ADMIN, f"""select api.update_business_settings(
  '{key(65)}'::uuid, p_employee_discount_limit_percent => 8)::text;""")
check('46 الإعادة تسبق حارس السقف: تسترجع النتيجة لا BD400',
      'ERROR' not in out and '"was_replayed": true' in out2, out + out2)

out = as_user(ADMIN, f"""select api.update_pricing_rule(
  'standard', 'other_with_lining', 36000, 4500, '{key(63)}'::uuid)::text;""")
probe = sql(f"""select 'P=' || customer_price_per_meter_agorot || '|C=' || tailor_cost_per_meter_agorot
 from core.pricing_rules where organization_id = '{ORG}'
   and band = 'standard' and category = 'other_with_lining';""", quiet=False)
check('47 قاعدة تسعير بالمفتاح الثابت تتحدث',
      'ERROR' not in out and 'P=36000|C=4500' in probe, out + probe)

out = as_user(ADMIN, f"""select api.update_pricing_rule(
  'standard', 'other_with_lining', 36000, 4500, '{key(63)}'::uuid)::text;""")
check('48 الإعادة بنفس المفتاح: was_replayed', '"was_replayed": true' in out, out)

out = as_user(ADMIN, f"""select api.update_pricing_rule(
  'tall', 'crepe_with_lining', 36000, 4500, '{key(67)}'::uuid)::text;""")
check('49 قاعدة غائبة → BD404 برسالة مصممة',
      'BD404' in out or 'غير موجودة' in out, out)

# غياب صف الإعدادات: رفض صريح لا «نجاح» على صفر صفوف يُسجَّل ويُعاد للأبد
sql(f"""delete from core.business_settings where organization_id = '{ORG}';""")
out = as_user(ADMIN, f"""select api.update_business_settings(
  '{key(68)}'::uuid, p_motor_price_agorot => 77000)::text;""")
check('50 لا صف إعدادات → BD404 لا نجاح وهمي',
      'BD404' in out or 'غير مهيأة' in out, out)

print('\n=== cleanup ===')
sql(PURGE)
print('purged')

print(f'\n===== النتيجة: نجح {len(passed)} / فشل {len(failed)} =====')
if failed:
    for f in failed:
        print('FAILED:', f)
    sys.exit(1)
