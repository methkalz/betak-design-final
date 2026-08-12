"""أول RPCs الكتابة: receive_fabric_roll و complete_window.

الاستلام بمساريه (الأدمن لأي وجهة، والخياط لمخزونه هو حصرًا) مع توليد
الرمز والدفعة تحت القفل وإشعار الأدمن، وإتمام الشباك بتوزيع الاستهلاك
على الحجوزات بالأقدم فالأقدم، والزيادة برمز سبب معتمد، والقيود تحمل
window_id الذي منه وحده يُشتق «الشباك مُنجز».
"""
import sys, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.environ.get('VPS_HELPER_DIR', HERE)
sys.path.insert(0, HELPER)
from vps import run, put_text  # noqa: E402

IID = os.environ.get('BAYTAK_INSTANCE_ID') or open(
    os.path.join(HELPER, 'instance_id.txt')).read().strip()
DB = os.environ.get('BAYTAK_DB_CONTAINER') or f'supabase-db-{IID}'

ORG   = 'bbbb6666-0000-4000-8000-000000000001'
ADMIN = 'bbbb6666-0000-4000-8000-0000000000a1'
T1    = 'bbbb6666-0000-4000-8000-0000000000a2'
T2    = 'bbbb6666-0000-4000-8000-0000000000a3'
T3    = 'bbbb6666-0000-4000-8000-0000000000a4'  # خياط معطَّل
SALES = 'bbbb6666-0000-4000-8000-0000000000a5'
CUST  = 'bbbb6666-0000-4000-8000-0000000000c1'
PROD  = 'bbbb6666-0000-4000-8000-0000000000e1'
VAR   = 'bbbb6666-0000-4000-8000-0000000000e2'  # للاستلام
VARW  = 'bbbb6666-0000-4000-8000-0000000000e3'  # لقماش الشبابيك
PRJ   = 'bbbb6666-0000-4000-8000-0000000000d1'
ROOM  = 'bbbb6666-0000-4000-8000-0000000000d2'
W1    = 'bbbb6666-0000-4000-8000-0000000000f1'  # planned 6.000
W2    = 'bbbb6666-0000-4000-8000-0000000000f2'  # planned 6.000 (زيادة)
W3    = 'bbbb6666-0000-4000-8000-0000000000f3'  # بلا حجوزات
RL1   = 'bbbb6666-0000-4000-8000-00000000f0d1'
RL2   = 'bbbb6666-0000-4000-8000-00000000f0d2'
RL3   = 'bbbb6666-0000-4000-8000-00000000f0d3'
RES1  = 'bbbb6666-0000-4000-8000-00000000e0d1'
RES2  = 'bbbb6666-0000-4000-8000-00000000e0d2'
RES3  = 'bbbb6666-0000-4000-8000-00000000e0d3'


def key(n): return f'bbbb6666-0000-4000-8000-00000000ee{n:02d}'


passed, failed = [], []


def sql(text, quiet=True):
    put_text(text + '\n', '/tmp/iwr.sql')
    return run(f'docker exec -i {DB} psql -U postgres {"-q" if quiet else ""} < /tmp/iwr.sql 2>&1')


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


PURGE = f"""
set session_replication_role = replica;
delete from core.client_operations   where organization_id = '{ORG}';
delete from core.audit_logs          where organization_id = '{ORG}';
delete from core.notifications       where organization_id = '{ORG}';
delete from core.fabric_usage        where organization_id = '{ORG}';
delete from core.stock_movements     where organization_id = '{ORG}';
delete from core.fabric_reservations where organization_id = '{ORG}';
delete from core.fabric_rolls        where organization_id = '{ORG}';
delete from core.windows             where organization_id = '{ORG}';
delete from core.rooms               where organization_id = '{ORG}';
delete from core.projects            where organization_id = '{ORG}';
delete from core.customers           where organization_id = '{ORG}';
delete from core.fabric_variants     where organization_id = '{ORG}';
delete from core.fabric_products     where organization_id = '{ORG}';
delete from core.organization_members where organization_id = '{ORG}';
delete from core.business_settings   where organization_id = '{ORG}';
delete from core.organizations       where id = '{ORG}';
delete from core.profiles            where id in ('{ADMIN}','{T1}','{T2}','{T3}','{SALES}');
delete from auth.users               where id in ('{ADMIN}','{T1}','{T2}','{T3}','{SALES}');
set session_replication_role = origin;
"""

print('=== seeding ===')
users = ",\n ".join(
    f"('{u}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','iwr{i}@t.local','x',now(),now(),now())"
    for i, u in enumerate([ADMIN, T1, T2, T3, SALES]))
out = sql(PURGE + f"""
insert into core.organizations (id,name) values ('{ORG}','كتابة المخزون');
insert into core.business_settings (organization_id) values ('{ORG}');
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,
                        email_confirmed_at,created_at,updated_at) values
 {users};
insert into core.profiles (id,full_name) values
 ('{ADMIN}','أدمن الكتابة'), ('{T1}','خياط أول'), ('{T2}','خياط ثانٍ'),
 ('{T3}','خياط معطَّل'), ('{SALES}','بائع');
insert into core.organization_members (organization_id,user_id,role,is_active) values
 ('{ORG}','{ADMIN}','admin',true), ('{ORG}','{T1}','tailor',true),
 ('{ORG}','{T2}','tailor',true), ('{ORG}','{T3}','tailor',false),
 ('{ORG}','{SALES}','sales',true);
insert into core.customers (id,organization_id,full_name,phone)
values ('{CUST}','{ORG}','زبون الكتابة','05');
insert into core.fabric_products (id,organization_id,name,kind,width_cm)
values ('{PROD}','{ORG}','مخمل الكتابة','other',280);
insert into core.fabric_variants (id,organization_id,product_id,color_name,sku,cost_per_meter_agorot) values
 ('{VAR}','{ORG}','{PROD}','رملي','WR',2000),
 ('{VARW}','{ORG}','{PROD}','زيتي','WW',2000);
insert into core.projects (id,organization_id,customer_id,code,status_code,tailor_id)
values ('{PRJ}','{ORG}','{CUST}','WR-1','with_tailor','{T1}');
insert into core.rooms (id,organization_id,project_id,name)
values ('{ROOM}','{ORG}','{PRJ}','صالون');
insert into core.windows (id,organization_id,project_id,room_id,name,width_cm,height_cm,
                          has_lining,fullness,quantity,fabric_variant_id) values
 ('{W1}','{ORG}','{PRJ}','{ROOM}','شباك الإتمام',200,250,false,3,1,'{VARW}'),
 ('{W2}','{ORG}','{PRJ}','{ROOM}','شباك الزيادة',200,250,false,3,1,'{VARW}'),
 ('{W3}','{ORG}','{PRJ}','{ROOM}','شباك بلا حجز',200,250,false,3,1,'{VARW}');
insert into core.fabric_rolls (id,organization_id,variant_id,code,initial_meters) values
 ('{RL1}','{ORG}','{VARW}','WW-1',20), ('{RL2}','{ORG}','{VARW}','WW-2',20),
 ('{RL3}','{ORG}','{VARW}','WW-3',15);
insert into core.stock_movements (organization_id,roll_id,type,quantity_m,notes,created_by,idempotency_key) values
 ('{ORG}','{RL1}','receipt',20,'بذرة','{ADMIN}',gen_random_uuid()),
 ('{ORG}','{RL2}','receipt',20,'بذرة','{ADMIN}',gen_random_uuid()),
 ('{ORG}','{RL3}','receipt',15,'بذرة','{ADMIN}',gen_random_uuid());
insert into core.fabric_reservations (id,organization_id,project_id,roll_id,quantity_m,created_by,created_at) values
 ('{RES1}','{ORG}','{PRJ}','{RL1}',4,'{ADMIN}',now() - interval '2 hours'),
 ('{RES2}','{ORG}','{PRJ}','{RL2}',2,'{ADMIN}',now() - interval '1 hour'),
 ('{RES3}','{ORG}','{PRJ}','{RL3}',5,'{ADMIN}',now());
insert into core.stock_movements (organization_id,roll_id,type,quantity_m,project_id,reservation_id,notes,created_by,idempotency_key) values
 ('{ORG}','{RL1}','reservation',4,'{PRJ}','{RES1}','بذرة','{ADMIN}',gen_random_uuid()),
 ('{ORG}','{RL2}','reservation',2,'{PRJ}','{RES2}','بذرة','{ADMIN}',gen_random_uuid()),
 ('{ORG}','{RL3}','reservation',5,'{PRJ}','{RES3}','بذرة','{ADMIN}',gen_random_uuid());
""")
if 'ERROR' in out:
    print(out); sys.exit(1)
print('seeded')

# ── receive_fabric_roll ──────────────────────────────────────────────────────
out = as_user(ADMIN, f"""select api.receive_fabric_roll(
  '{VAR}'::uuid, 20, '{key(1)}'::uuid, 'رف A3', null)::text;""")
check('01 الأدمن يستلم للمعرض: رمز تسلسلي على اللون وموقع محفوظ',
      '"code": "WR-1"' in out and 'ERROR' not in out, out)

probe = sql(f"""select count(*) || '|' || min(location)
from core.fabric_rolls where organization_id='{ORG}' and variant_id='{VAR}';""", quiet=False)
check('02 الرول قائم والموقع كما أُدخل', '1|رف A3' in probe, probe)

out = as_user(T1, f"""select api.receive_fabric_roll(
  '{VAR}'::uuid, 25.5, '{key(2)}'::uuid, 'رف مهرَّب', '{T1}'::uuid)::text;""")
ok = '"was_replayed": false' in out.replace('" : ', '": ') and 'ERROR' not in out
probe = sql(f"""select code || '|' || coalesce(nullif(location,''),'فارغ') || '|' || assigned_tailor_id
from core.fabric_rolls where organization_id='{ORG}' and variant_id='{VAR}'
  and assigned_tailor_id is not null;""", quiet=False)
check('03 الخياط يستلم لمخزونه: الوجهة نفسه والموقع يُفرَّغ',
      ok and f'WR-2|فارغ|{T1}' in probe, out + probe)

probe = sql(f"""select count(*) || '|' || min(kind::text) || '|' || min(deep_link)
from core.notifications where organization_id='{ORG}' and kind='stock_received';""", quiet=False)
check('04 إشعار «إضافة بضاعة» لكل أدمن نشط برابط رصيد الصنف',
      f'1|stock_received|/stock/{VAR}' in probe, probe)

out = as_user(T1, f"""select api.receive_fabric_roll(
  '{VAR}'::uuid, 5, '{key(3)}'::uuid, null, '{T2}'::uuid)::text;""")
check('05 خياط يستلم لزميله → BD403', 'BD403' in out or 'حصرًا' in out, out)

out = as_user(SALES, f"""select api.receive_fabric_roll(
  '{VAR}'::uuid, 5, '{key(4)}'::uuid, null, null)::text;""")
check('06 البائع لا يستلم → BD403', 'BD403' in out or 'حصرًا' in out, out)

out = as_user(ADMIN, f"""select api.receive_fabric_roll(
  '{VAR}'::uuid, 0, '{key(5)}'::uuid, null, null)::text;""")
ok1 = 'أكبر من صفر' in out
out = as_user(ADMIN, f"""select api.receive_fabric_roll(
  '{VAR}'::uuid, 20000, '{key(6)}'::uuid, null, null)::text;""")
check('07 حدود الأمتار: صفر مرفوض و20000 مرفوضة',
      ok1 and 'راجع الرقم' in out, out)

out = as_user(ADMIN, f"""select api.receive_fabric_roll(
  '{VAR}'::uuid, 5, '{key(7)}'::uuid, null, '{T3}'::uuid)::text;""")
check('08 الوجهة خياط معطَّل → BD422', 'BD422' in out or 'مفعَّلًا' in out, out)

out = as_user(T1, f"""select api.receive_fabric_roll(
  '{VAR}'::uuid, 25.5, '{key(2)}'::uuid, 'رف مهرَّب', '{T1}'::uuid)::text;""")
probe = sql(f"""select count(*) from core.fabric_rolls
where organization_id='{ORG}' and variant_id='{VAR}';""", quiet=False)
check('09 الإعادة بنفس المفتاح: was_replayed ولا رول جديد',
      'was_replayed' in out and 'true' in out and re.search(r'\b2\b', probe), out + probe)

# ── complete_window ──────────────────────────────────────────────────────────
# الخياط المسند يغلق شباكه: 6 م على حجزين بالأقدم فالأقدم (4 ثم 2)
out = as_user(T1, f"""select api.complete_window(
  '{W1}'::uuid, 6, '{key(10)}'::uuid, null, null)::text;""")
check('10 إتمام 6 م: نجاح من الخياط المسند', 'ERROR' not in out and '"actual_m": 6' in out.replace('" : ', '": '), out)

probe = sql(f"""select string_agg(u.planned_m::text || '/' || u.actual_m::text || '/' || u.waste_m::text, '|' order by u.planned_m desc)
 || '#' || (select count(*) from core.fabric_usage where window_id='{W1}')
 || '#' || (select string_agg(status::text, '|' order by created_at)
            from core.fabric_reservations where id in ('{RES1}','{RES2}'))
from core.fabric_usage u where u.window_id='{W1}';""", quiet=False)
check('11 الشرائح: 4 ثم 2، مخططها مجموعه مخطط الشباك، وحالتا الحجزين',
      '4.000/4.000/0.000|2.000/2.000/0.000#2#consumed|consumed' in probe, probe)

out = as_user(T1, f"""select api.complete_window(
  '{W1}'::uuid, 6, '{key(11)}'::uuid, null, null)::text;""")
check('12 إتمام ثانٍ بمفتاح جديد → BD409 منجز بالفعل',
      'BD409' in out or 'منجزًا بالفعل' in out, out)

# زيادة عن المخطط وعن المحجوز معًا: 7 م على حجز 5 م (planned 6)
out = as_user(T1, f"""select api.complete_window(
  '{W2}'::uuid, 7, '{key(12)}'::uuid, null, null)::text;""")
check('13 زيادة بلا سبب → BD400', 'BD400' in out or 'اكتب السبب' in out, out)

out = as_user(T1, f"""select api.complete_window(
  '{W2}'::uuid, 7, '{key(13)}'::uuid, 'other', 'قصّة معادة')::text;""")
check('14 زيادة بسبب معتمد: تُقبل', 'ERROR' not in out and '"overconsumed_m": 2' in out.replace('" : ', '": '), out)

probe = sql(f"""select
  (select string_agg(m.type::text || ':' || m.quantity_m::text, '|' order by m.type)
   from core.stock_movements m where m.reservation_id='{RES3}'
     and m.type in ('consumption','overconsumption'))
 || '#' || (select u.planned_m::text || '/' || u.actual_m::text || '/' || u.waste_m::text || '/' || coalesce(u.reason_code,'-')
            from core.fabric_usage u where u.window_id='{W2}')
 || '#' || (select count(*) from core.notifications
            where organization_id='{ORG}' and title='استهلاك أعلى من المخطط');""", quiet=False)
check('15 دفتر الزيادة: استهلاك 5 + زيادة 2، وقيد 6/7/1 بسببه، وإشعار للأدمن',
      'consumption:5.000|overconsumption:2.000#6.000/7.000/1.000/other#1' in probe, probe)

out = as_user(T2, f"""select api.complete_window(
  '{W3}'::uuid, 6, '{key(14)}'::uuid, null, null)::text;""")
check('16 خياط غير مسند → BD403', 'BD403' in out or 'المسند' in out, out)

out = as_user(T1, f"""select api.complete_window(
  '{W3}'::uuid, 6, '{key(15)}'::uuid, null, null)::text;""")
check('17 شباك بلا حجوزات → BD422', 'BD422' in out or 'لا يوجد قماش محجوز' in out, out)

print('\n=== cleanup ===')
sql(PURGE)
print('purged')

print(f'\n===== النتيجة: نجح {len(passed)} / فشل {len(failed)} =====')
if failed:
    for f in failed:
        print('FAILED:', f)
    sys.exit(1)
