"""اختبار api.reserve_fabric — معايير القبول كاملة.

يشمل اختبار تزامن حقيقي باتصالين متوازيين، وهو الوحيد الذي يثبت أن القفل
FOR UPDATE يمنع الرصيد السالب. الاختبارات المتتابعة لا تثبت ذلك إطلاقًا.

يُشغَّل عبر paramiko؛ انظر _vps_helper.py.example.
البيانات تُزرع ملتزَمة (التزامن يحتاج رؤية مشتركة) وتُحذف في النهاية.
"""
import sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.environ.get('VPS_HELPER_DIR', HERE)
sys.path.insert(0, HELPER)
from vps import run, put_text  # noqa: E402

IID = os.environ.get('BAYTAK_INSTANCE_ID') or open(
    os.path.join(HELPER, 'instance_id.txt')).read().strip()
DB = os.environ.get('BAYTAK_DB_CONTAINER') or f'supabase-db-{IID}'

# معرّفات سداسية صالحة بالكامل
ORG_A   = 'aaaa0000-0000-4000-8000-000000000001'
ORG_B   = 'bbbb0000-0000-4000-8000-000000000001'
ADMIN   = 'aaaa0000-0000-4000-8000-0000000000a1'
TAILOR  = 'aaaa0000-0000-4000-8000-0000000000a2'
CUST    = 'aaaa0000-0000-4000-8000-0000000000c1'
PROJECT = 'aaaa0000-0000-4000-8000-0000000000d1'
PROD_A  = 'aaaa0000-0000-4000-8000-0000000000e1'
VAR_A   = 'aaaa0000-0000-4000-8000-0000000000e2'
ROLL_A  = 'aaaa0000-0000-4000-8000-0000000000e3'
PROD_B  = 'bbbb0000-0000-4000-8000-0000000000e1'
VAR_B   = 'bbbb0000-0000-4000-8000-0000000000e2'
ROLL_B  = 'bbbb0000-0000-4000-8000-0000000000e3'

K1 = 'aaaa1111-0000-4000-8000-000000000001'
K2 = 'aaaa1111-0000-4000-8000-000000000002'
K3 = 'aaaa1111-0000-4000-8000-000000000003'
K4 = 'aaaa1111-0000-4000-8000-000000000004'

passed, failed = [], []


def sql(text, quiet=True):
    put_text(text + '\n', '/tmp/t.sql')
    return run(f'docker exec -i {DB} psql -U postgres {"-q" if quiet else ""} < /tmp/t.sql 2>&1')


def as_user(uid, body):
    return sql(
        "set role postgres;\n"
        f"select set_config('request.jwt.claims',"
        f"'{{\"sub\":\"{uid}\",\"role\":\"authenticated\"}}',false) \\g /dev/null\n"
        "set role authenticated;\n" + body
    )


def check(name, ok, detail=''):
    (passed if ok else failed).append(name)
    print(f'{"PASS" if ok else "FAIL"}  {name}')
    if not ok and detail:
        print('      ' + detail.strip().replace('\n', '\n      ')[:600])


PURGE = f"""
set session_replication_role = replica;
delete from core.stock_movements     where organization_id in ('{ORG_A}','{ORG_B}');
delete from core.fabric_reservations where organization_id in ('{ORG_A}','{ORG_B}');
delete from core.client_operations   where organization_id in ('{ORG_A}','{ORG_B}');
delete from core.audit_logs          where organization_id in ('{ORG_A}','{ORG_B}');
delete from core.projects            where organization_id in ('{ORG_A}','{ORG_B}');
delete from core.customers           where organization_id in ('{ORG_A}','{ORG_B}');
delete from core.fabric_rolls        where organization_id in ('{ORG_A}','{ORG_B}');
delete from core.fabric_variants     where organization_id in ('{ORG_A}','{ORG_B}');
delete from core.fabric_products     where organization_id in ('{ORG_A}','{ORG_B}');
delete from core.organization_members where organization_id in ('{ORG_A}','{ORG_B}');
delete from core.business_settings   where organization_id in ('{ORG_A}','{ORG_B}');
delete from core.organizations       where id in ('{ORG_A}','{ORG_B}');
delete from core.profiles            where id in ('{ADMIN}','{TAILOR}');
delete from auth.users               where id in ('{ADMIN}','{TAILOR}');
set session_replication_role = origin;
"""

print('=== seeding ===')
seed = PURGE + f"""
insert into core.organizations (id,name) values ('{ORG_A}','اختبار أ'),('{ORG_B}','اختبار ب');
insert into core.business_settings (organization_id) values ('{ORG_A}'),('{ORG_B}');
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,
                        email_confirmed_at,created_at,updated_at)
values ('{ADMIN}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@t.local','x',now(),now(),now()),
       ('{TAILOR}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t@t.local','x',now(),now(),now());
insert into core.profiles (id,full_name) values ('{ADMIN}','أدمن'),('{TAILOR}','خياط');
insert into core.organization_members (organization_id,user_id,role)
values ('{ORG_A}','{ADMIN}','admin'),('{ORG_A}','{TAILOR}','tailor');
insert into core.customers (id,organization_id,full_name,phone)
values ('{CUST}','{ORG_A}','زبون','05');
insert into core.projects (id,organization_id,customer_id,code,status_code)
values ('{PROJECT}','{ORG_A}','{CUST}','T-1','customer_approved');
insert into core.fabric_products (id,organization_id,name,kind,width_cm)
values ('{PROD_A}','{ORG_A}','كريب','crepe',280),('{PROD_B}','{ORG_B}','كريب','crepe',280);
insert into core.fabric_variants (id,organization_id,product_id,color_name,sku,cost_per_meter_agorot)
values ('{VAR_A}','{ORG_A}','{PROD_A}','بيج','A1',1400),
       ('{VAR_B}','{ORG_B}','{PROD_B}','بيج','B1',1400);
insert into core.fabric_rolls (id,organization_id,variant_id,code,initial_meters)
values ('{ROLL_A}','{ORG_A}','{VAR_A}','TR-001',20),
       ('{ROLL_B}','{ORG_B}','{VAR_B}','TR-B02',50);
insert into core.stock_movements (organization_id,roll_id,type,quantity_m,created_by,idempotency_key)
values ('{ORG_A}','{ROLL_A}','receipt',20,'{ADMIN}',gen_random_uuid());
select 'seeded' as status;
"""
out = sql(seed)
if 'ERROR' in out:
    print(out)
    sys.exit('seeding failed')
print('seeded — roll TR-001 with 20 m')

print('\n=== functional ===')

r = as_user(TAILOR, f"select api.reserve_fabric('{PROJECT}','{ROLL_A}',1,'{K1}');")
check('الخياط لا يستطيع الحجز (BD403)', 'دورك لا يسمح' in r, r)

r = as_user(ADMIN, f"select api.reserve_fabric('{PROJECT}','{ROLL_B}',1,'{K1}');")
check('رول من مؤسسة أخرى مرفوض (BD404)', 'غير موجود في هذه المؤسسة' in r, r)

r = as_user(ADMIN, f"select api.reserve_fabric('{PROJECT}','{ROLL_A}',999,'{K1}');")
check('رصيد غير كافٍ (BD422)', 'أكبر من المتاح' in r, r)

r = as_user(ADMIN, f"select api.reserve_fabric('{PROJECT}','{ROLL_A}',5,'{K1}');")
check('الأدمن يحجز 5 م', '"reserved_quantity_m": 5' in r.replace(' :', ':'), r)
check('لقطة الرصيد: متاح 15 م', '"available_quantity_m": 15' in r.replace(' :', ':'), r)

r2 = as_user(ADMIN, f"select api.reserve_fabric('{PROJECT}','{ROLL_A}',5,'{K1}');")
check('إعادة نفس المفتاح تُعيد النتيجة', '"was_replayed": true' in r2.replace(' :', ':'), r2)

n = sql(f"select count(*) as c from core.stock_movements "
        f"where roll_id='{ROLL_A}' and type='reservation';")
check('الإعادة لم تُنشئ حركة ثانية', ' 1' in n, n)

r = as_user(ADMIN, f"select api.reserve_fabric('{PROJECT}','{ROLL_A}',7,'{K1}');")
check('نفس المفتاح بكمية مختلفة يُرفض (BD400)', 'بمدخلات مختلفة' in r, r)

st = sql(f"select status_code from core.projects where id='{PROJECT}';")
check('حالة المشروع انتقلت إلى fabric_allocated', 'fabric_allocated' in st, st)

r = as_user(ADMIN, f"select api.reserve_fabric('{PROJECT}','{ROLL_A}',1,'{K4}',1);")
check('lock_version قديم يُرفض (BD409)', 'مستخدم آخر' in r, r)

sql(f"update core.projects set notes = notes || '.' where id='{PROJECT}';")
r = as_user(ADMIN, f"select api.reserve_fabric('{PROJECT}','{ROLL_A}',5,'{K1}',1);")
check('إعادة حجز ناجح تعمل رغم تغيّر إصدار المشروع (idempotency قبل فحص الإصدار)',
      '"was_replayed": true' in r.replace(' :', ':'), r)

print('\n=== concurrency: two live connections, 15 m each, 15 m available ===')
race = ("set role postgres;\n"
        "select set_config('request.jwt.claims',"
        "'{\"sub\":\"UID\",\"role\":\"authenticated\"}',false) \\g /dev/null\n"
        "set role authenticated;\n"
        "select api.reserve_fabric('PRJ','RLL',15,'KEY');\n")
for tag, key in (('A', K2), ('B', K3)):
    put_text(race.replace('UID', ADMIN).replace('PRJ', PROJECT)
                 .replace('RLL', ROLL_A).replace('KEY', key), f'/tmp/race_{tag}.sql')

out = run(
    f'docker exec -i {DB} psql -U postgres -q < /tmp/race_A.sql > /tmp/out_A 2>&1 & '
    f'docker exec -i {DB} psql -U postgres -q < /tmp/race_B.sql > /tmp/out_B 2>&1 & '
    'wait; echo "=A="; cat /tmp/out_A; echo "=B="; cat /tmp/out_B',
    timeout=180,
)
print(out)

check('التزامن: نجح واحد فقط', out.count('reservation_id') == 1,
      f'reservation_id appeared {out.count("reservation_id")} times')
check('التزامن: الآخر فشل بنقص الرصيد', 'أكبر من المتاح' in out, out)

# يشتق من core.movement_effects — المصدر المركزي — لا مصفوفة يدوية (DECISIONS §8)
final = sql(f"""select
  sum(m.quantity_m * e.on_hand_sign)  as on_hand,
  sum(m.quantity_m * e.reserved_sign) as reserved,
  count(*) filter (where m.type='reservation') as res_rows
from core.stock_movements m
join core.movement_effects e on e.type = m.type
where m.roll_id='{ROLL_A}';""")
print(final)
nums = [t for t in final.replace('|', ' ').split() if t.replace('.', '').replace('-', '').isdigit()]
on_hand, reserved, rows = (nums + ['?', '?', '?'])[:3]
check('الرصيد لم يصر سالبًا', float(on_hand) - float(reserved) >= 0,
      f'on_hand={on_hand} reserved={reserved}')
check('حركتا حجز فقط (5 + 15 = 20)', rows == '2' and float(reserved) == 20.0,
      f'rows={rows} reserved={reserved}')

print('\n=== cleanup ===')
sql(PURGE + 'select 1;')
left = sql(f"select count(*) as c from core.organizations where id in ('{ORG_A}','{ORG_B}');")
check('التنظيف كامل', ' 0' in left, left)
run('rm -f /tmp/t.sql /tmp/race_A.sql /tmp/race_B.sql /tmp/out_A /tmp/out_B')

print(f'\n===== {len(passed)} passed, {len(failed)} failed =====')
for f in failed:
    print('  FAILED:', f)
sys.exit(1 if failed else 0)
