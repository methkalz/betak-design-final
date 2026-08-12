"""اختبار دالتَي الخصم (ترحيل 20260804100001) — إكمال طبقة العروض.

المسار الكامل عبر الدوال حصرًا (لا إدراج مباشر لطلبات الخصم): طلبٌ على
مسودة بنسبة النسخة نفسها، بصمة fp1 تُلتقط عند الطلب، قرار الأدمن، ثم
الإرسال يتحقق — بما فيه مسار الـOverride فوق حد الأدمن (قاعدة الدليل).
"""
import sys, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.environ.get('VPS_HELPER_DIR', HERE)
sys.path.insert(0, HELPER)
from vps import run, put_text  # noqa: E402

IID = os.environ.get('BAYTAK_INSTANCE_ID') or open(
    os.path.join(HELPER, 'instance_id.txt')).read().strip()
DB = os.environ.get('BAYTAK_DB_CONTAINER') or f'supabase-db-{IID}'

ORG   = 'aaaa6666-0000-4000-8000-000000000001'
ADMIN = 'aaaa6666-0000-4000-8000-0000000000a1'
SALES = 'aaaa6666-0000-4000-8000-0000000000a2'
TAILOR= 'aaaa6666-0000-4000-8000-0000000000a3'
CUST  = 'aaaa6666-0000-4000-8000-0000000000c1'
PRODC = 'aaaa6666-0000-4000-8000-0000000000e1'
VARC  = 'aaaa6666-0000-4000-8000-0000000000e2'

passed, failed = [], []


def sql(text, quiet=True):
    put_text(text + '\n', '/tmp/dr.sql')
    return run(f'docker exec -i {DB} psql -U postgres {"-q" if quiet else ""} < /tmp/dr.sql 2>&1')


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


def pid(n): return f'aaaa6666-0000-4000-8000-0000000000d{n}'
def rid(n): return f'aaaa6666-0000-4000-8000-00000000f0d{n}'
def wid(n): return f'aaaa6666-0000-4000-8000-00000000e0d{n}'
def key(n): return f'aaaa6666-0000-4000-8000-00000000ee{n:02x}'


PURGE = f"""
set session_replication_role = replica;
delete from core.client_operations   where organization_id = '{ORG}';
delete from core.audit_logs          where organization_id = '{ORG}';
delete from core.discount_requests   where organization_id = '{ORG}';
delete from core.notifications       where organization_id = '{ORG}';
delete from core.quotation_items     where organization_id = '{ORG}';
delete from core.quotation_versions  where organization_id = '{ORG}';
delete from core.quotations          where organization_id = '{ORG}';
delete from core.document_sequences  where organization_id = '{ORG}';
delete from core.windows             where organization_id = '{ORG}';
delete from core.rooms               where organization_id = '{ORG}';
delete from core.projects            where organization_id = '{ORG}';
delete from core.customers           where organization_id = '{ORG}';
delete from core.pricing_rules       where organization_id = '{ORG}';
delete from core.fabric_variants     where organization_id = '{ORG}';
delete from core.fabric_products     where organization_id = '{ORG}';
delete from core.organization_members where organization_id = '{ORG}';
delete from core.business_settings   where organization_id = '{ORG}';
delete from core.organizations       where id = '{ORG}';
delete from core.profiles            where id in ('{ADMIN}','{SALES}','{TAILOR}');
delete from auth.users               where id in ('{ADMIN}','{SALES}','{TAILOR}');
set session_replication_role = origin;
"""

print('=== seeding ===')
projects_sql = ""
for n in range(1, 5):
    projects_sql += f"""
insert into core.projects (id, organization_id, customer_id, code, status_code)
values ('{pid(n)}', '{ORG}', '{CUST}', 'DR-{n}', 'quotation');
insert into core.rooms (id, organization_id, project_id, name)
values ('{rid(n)}', '{ORG}', '{pid(n)}', 'صالون');
insert into core.windows (id, organization_id, project_id, room_id, name,
        width_cm, height_cm, has_lining, fullness, quantity, fabric_variant_id)
values ('{wid(n)}', '{ORG}', '{pid(n)}', '{rid(n)}', 'شباك',
        200, 250, true, 3, 1, '{VARC}');"""

out = sql(PURGE + f"""
insert into core.organizations (id,name) values ('{ORG}','اختبار الخصومات');
insert into core.business_settings (organization_id, min_margin_percent)
values ('{ORG}', 10);
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,
                        email_confirmed_at,created_at,updated_at)
values ('{ADMIN}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dra@t.local','x',now(),now(),now()),
       ('{SALES}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','drs@t.local','x',now(),now(),now()),
       ('{TAILOR}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','drt@t.local','x',now(),now(),now());
insert into core.profiles (id,full_name)
values ('{ADMIN}','أدمن'),('{SALES}','مبيعات'),('{TAILOR}','خياط');
insert into core.organization_members (organization_id,user_id,role)
values ('{ORG}','{ADMIN}','admin'),('{ORG}','{SALES}','sales'),('{ORG}','{TAILOR}','tailor');
insert into core.customers (id,organization_id,full_name,phone)
values ('{CUST}','{ORG}','زبون','05');
insert into core.fabric_products (id,organization_id,name,kind,width_cm)
values ('{PRODC}','{ORG}','كريب','crepe',280);
insert into core.fabric_variants (id,organization_id,product_id,color_name,sku,cost_per_meter_agorot)
values ('{VARC}','{ORG}','{PRODC}','بيج','DR-B',1400);
insert into core.pricing_rules (organization_id,band,category,customer_price_per_meter_agorot,tailor_cost_per_meter_agorot) values
 ('{ORG}','standard','crepe_with_lining',29000,4000),
 ('{ORG}','standard','crepe_without_lining',27000,4000),
 ('{ORG}','standard','other_without_lining',29000,4000),
 ('{ORG}','standard','other_with_lining',35000,4000),
 ('{ORG}','tall','crepe_with_lining',45000,7000),
 ('{ORG}','tall','crepe_without_lining',43000,7000),
 ('{ORG}','tall','other_without_lining',45000,7000),
 ('{ORG}','tall','other_with_lining',51000,7000);
""" + projects_sql)
if 'ERROR' in out:
    print(out); sys.exit(1)
print('seeded')


def create(user, n, k, disc):
    return as_user(user, f"""select api.create_quotation_version(
      '{pid(n)}'::uuid, {disc}, '', '{k}'::uuid)::text;""")

# المسودات: v1 بخصم 7 (فوق حد الموظف 5)، v2 بخصم 4 (ضمنه)، v3 بخصم 12 (Override)
out = create(SALES, 1, key(1), 7)
v1 = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
out = create(SALES, 2, key(2), 4)
v2 = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
out = create(ADMIN, 3, key(3), 12)
v3 = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
out = create(SALES, 4, key(4), 6)
v4 = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)

out = as_user(TAILOR, f"""select api.request_discount(
  '{v1}'::uuid, 'سبب', '{key(5)}'::uuid)::text;""")
check('01 الخياط لا يطلب خصومات BD403', 'دورك' in out or 'BD403' in out, out)

out = as_user(SALES, f"""select api.request_discount(
  '{v1}'::uuid, '  ', '{key(6)}'::uuid)::text;""")
check('02 سبب فارغ BD400', 'إلزامي' in out, out)

out = as_user(SALES, f"""select api.request_discount(
  '{v2}'::uuid, 'زبون قديم', '{key(7)}'::uuid)::text;""")
check('03 نسبة ضمن حد الموظف: لا يلزم طلب BD400', 'لا يلزم طلب' in out, out)

out = as_user(SALES, f"""select api.request_discount(
  '{v1}'::uuid, 'زبون قديم ومشروع كبير', '{key(8)}'::uuid)::text;""")
r1 = grab(r'"request_id"\s*:\s*"([0-9a-f-]+)"', out)
fp1 = grab(r'"content_fingerprint"\s*:\s*"([0-9a-f]{64})"', out)
check('04 طلب شرعي: pending بنسبة النسخة (7) وبصمة 64-hex',
      r1 is not None and fp1 is not None and '"requested_percent": 7' in out, out)

probe = sql(f"""select (dr.content_fingerprint = private.version_content_fingerprint('{v1}'))::text
from core.discount_requests dr where dr.id = '{r1}';""", quiet=False)
check('05 بصمة الطلب = بصمة المحتوى الحية (نفس الدالة الموحدة)', 'true' in probe, probe)

out = as_user(SALES, f"""select api.request_discount(
  '{v1}'::uuid, 'سبب آخر', '{key(9)}'::uuid)::text;""")
check('06 طلب معلّق واحد لكل نسخة BD409', 'معلّق' in out, out)

out = as_user(SALES, f"""select api.request_discount(
  '{v1}'::uuid, 'زبون قديم ومشروع كبير', '{key(8)}'::uuid)::text;""")
check('07 الإعادة بنفس المفتاح والمدخلات replayed', '"was_replayed": true' in out, out)

out = as_user(SALES, f"""select api.request_discount(
  '{v1}'::uuid, 'سبب مختلف', '{key(8)}'::uuid)::text;""")
check('08 نفس المفتاح بمدخلات مختلفة BD400', 'مختلفة' in out, out)

out = as_user(SALES, f"""select api.decide_discount_request(
  '{r1}'::uuid, true, '{key(10)}'::uuid)::text;""")
check('09 قرار الخصم للأدمن حصرًا BD403', 'حصرًا' in out or 'BD403' in out, out)

out = as_user(ADMIN, f"""select api.decide_discount_request(
  '{r1}'::uuid, false, '{key(11)}'::uuid, '')::text;""")
check('10 رفض بلا ملاحظة BD422', 'إلزامية' in out, out)

out = as_user(ADMIN, f"""select api.decide_discount_request(
  '{r1}'::uuid, true, '{key(12)}'::uuid, 'موافق للحالة')::text;""")
check('11 اعتماد الأدمن نجح', '"status": "approved"' in out, out)

out = as_user(ADMIN, f"""select api.decide_discount_request(
  '{r1}'::uuid, false, '{key(13)}'::uuid, 'تراجع')::text;""")
check('12 لا قرار على مقرَّر BD409', 'سلفًا' in out, out)

out = as_user(SALES, f"""select api.send_quotation_version(
  '{v1}'::uuid, '{key(14)}'::uuid)::text;""")
check('13 إرسال 7% بموافقة عبر الدوال حصرًا نجح', '"was_replayed": false' in out and 'ERROR' not in out, out)

out = as_user(SALES, f"""select api.request_discount(
  '{v1}'::uuid, 'بعد الإرسال', '{key(15)}'::uuid)::text;""")
check('14 لا طلب على نسخة مرسلة BD409', 'للمسودات فقط' in out, out)

# Override كامل عبر الدوال: 12% فوق حد الأدمن — طلب ثم اعتماد ثم إرسال
out = as_user(ADMIN, f"""select api.request_discount(
  '{v3}'::uuid, 'صفقة استثنائية موثقة', '{key(16)}'::uuid)::text;""")
r3 = grab(r'"request_id"\s*:\s*"([0-9a-f-]+)"', out)
check('15 طلب Override فوق حد الأدمن (12%) يُقبل كطلب', r3 is not None, out)

out = as_user(ADMIN, f"""select api.decide_discount_request(
  '{r3}'::uuid, true, '{key(17)}'::uuid, 'اعتماد استثنائي موثق')::text;""")
ok_approve = '"status": "approved"' in out
out = as_user(ADMIN, f"""select api.send_quotation_version(
  '{v3}'::uuid, '{key(18)}'::uuid)::text;""")
check('16 مسار الدليل كاملًا: Override معتمد ← الإرسال يمر',
      ok_approve and 'ERROR' not in out and '"was_replayed": false' in out, out)

# إعادة الطلب بعد الرفض
out = as_user(SALES, f"""select api.request_discount(
  '{v4}'::uuid, 'محاولة أولى', '{key(19)}'::uuid)::text;""")
r4 = grab(r'"request_id"\s*:\s*"([0-9a-f-]+)"', out)
out = as_user(ADMIN, f"""select api.decide_discount_request(
  '{r4}'::uuid, false, '{key(20)}'::uuid, 'الهامش لا يسمح الآن')::text;""")
ok_rej = '"status": "rejected"' in out
out = as_user(SALES, f"""select api.request_discount(
  '{v4}'::uuid, 'محاولة ثانية بمبررات أقوى', '{key(21)}'::uuid)::text;""")
check('17 بعد الرفض يجوز طلب جديد (المعلّق الواحد يخص pending فقط)',
      ok_rej and grab(r'"request_id"\s*:\s*"([0-9a-f-]+)"', out) is not None, out)

# ── إشعارات العائلة (ترحيل 20260812190001): الطلب يصل الأدمن والقرار صاحبه ──
probe = sql(f"""select
  (select count(*) from core.notifications
   where organization_id='{ORG}' and kind='discount_request'
     and title like 'طلب خصم%')
 || '|' ||
  (select count(*) from core.notifications
   where organization_id='{ORG}' and kind='discount_request'
     and (title = 'تمت الموافقة على الخصم' or title = 'تم رفض الخصم'));""", quiet=False)
m = re.search(r'(\d+)\|(\d+)', probe)
check('الإشعارات: طلبات وصلت الأدمن وقرارات وصلت أصحابها',
      bool(m) and int(m.group(1)) > 0 and int(m.group(2)) > 0, probe)

print('\n=== cleanup ===')
sql(PURGE)
print('purged')

print(f'\n===== النتيجة: نجح {len(passed)} / فشل {len(failed)} =====')
if failed:
    for f in failed:
        print('FAILED:', f)
    sys.exit(1)
