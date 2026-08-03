"""اختبار api.consume_fabric و api.release_reservation.

يغطي الدلالات المحاسبية، الزيادة عن الحجز، الـinvariants، التزامن الحقيقي،
الـidempotency، والتراجع الكامل عند فشل التدقيق.
"""
import sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.environ.get('VPS_HELPER_DIR', HERE)
sys.path.insert(0, HELPER)
from vps import run, put_text  # noqa: E402

IID = os.environ.get('BAYTAK_INSTANCE_ID') or open(
    os.path.join(HELPER, 'instance_id.txt')).read().strip()
DB = f'supabase-db-{IID}'

ORG   = 'cccc0000-0000-4000-8000-000000000001'
ORG2  = 'dddd0000-0000-4000-8000-000000000001'
ADMIN = 'cccc0000-0000-4000-8000-0000000000a1'
TLR   = 'cccc0000-0000-4000-8000-0000000000a2'  # الخياط المسند
TLR2  = 'cccc0000-0000-4000-8000-0000000000a3'  # خياط غير مسند
CUST  = 'cccc0000-0000-4000-8000-0000000000c1'
PROJ  = 'cccc0000-0000-4000-8000-0000000000d1'
PROD  = 'cccc0000-0000-4000-8000-0000000000e1'
VAR   = 'cccc0000-0000-4000-8000-0000000000e2'
ROLL  = 'cccc0000-0000-4000-8000-0000000000e3'
RES1  = 'cccc0000-0000-4000-8000-0000000000f1'
RES2  = 'cccc0000-0000-4000-8000-0000000000f2'

passed, failed = [], []


def sql(t):
    put_text(t + '\n', '/tmp/cr.sql')
    return run(f'docker exec -i {DB} psql -U postgres -q < /tmp/cr.sql 2>&1')


def as_user(uid, body):
    return sql("set role postgres;\n"
               f"select set_config('request.jwt.claims',"
               f"'{{\"sub\":\"{uid}\",\"role\":\"authenticated\"}}',false) \\g /dev/null\n"
               "set role authenticated;\n" + body)


def check(name, ok, detail=''):
    (passed if ok else failed).append(name)
    print(f'{"PASS" if ok else "FAIL"}  {name}')
    if not ok and detail:
        print('      ' + detail.strip().replace('\n', '\n      ')[:500])


def balances():
    # يشتق من core.movement_effects — المصدر المركزي — فلا تتقادم نسخة يدوية هنا
    out = sql(f"""select
      round(coalesce(sum(m.quantity_m * e.on_hand_sign),0),3),
      greatest(0, round(coalesce(sum(m.quantity_m * e.reserved_sign),0),3))
      from core.stock_movements m
      join core.movement_effects e on e.type = m.type
      where m.roll_id='{ROLL}';""")
    nums = [t for t in out.replace('|', ' ').split() if t.replace('.', '').replace('-', '').isdigit()]
    oh, rs = float(nums[0]), float(nums[1])
    return oh, rs, max(0.0, round(oh - rs, 3))


def invariants(tag):
    oh, rs, av = balances()
    ok = oh >= 0 and rs >= 0 and av >= 0 and rs <= oh
    check(f'invariants {tag}: on_hand≥0 reserved≥0 available≥0 reserved≤on_hand',
          ok, f'on_hand={oh} reserved={rs} available={av}')
    return oh, rs, av


PURGE = f"""
set session_replication_role = replica;
delete from core.stock_movements     where organization_id in ('{ORG}','{ORG2}');
delete from core.fabric_usage        where organization_id in ('{ORG}','{ORG2}');
delete from core.fabric_reservations where organization_id in ('{ORG}','{ORG2}');
delete from core.client_operations   where organization_id in ('{ORG}','{ORG2}');
delete from core.audit_logs          where organization_id in ('{ORG}','{ORG2}');
delete from core.notifications       where organization_id in ('{ORG}','{ORG2}');
delete from core.projects            where organization_id in ('{ORG}','{ORG2}');
delete from core.customers           where organization_id in ('{ORG}','{ORG2}');
delete from core.fabric_rolls        where organization_id in ('{ORG}','{ORG2}');
delete from core.fabric_variants     where organization_id in ('{ORG}','{ORG2}');
delete from core.fabric_products     where organization_id in ('{ORG}','{ORG2}');
delete from core.organization_members where organization_id in ('{ORG}','{ORG2}');
delete from core.business_settings   where organization_id in ('{ORG}','{ORG2}');
delete from core.organizations       where id in ('{ORG}','{ORG2}');
delete from core.profiles            where id in ('{ADMIN}','{TLR}','{TLR2}');
delete from auth.users               where id in ('{ADMIN}','{TLR}','{TLR2}');
set session_replication_role = origin;
"""

print('=== seeding: roll 100 m, reservation RES1 = 20 m, RES2 = 30 m ===')
seed = PURGE + f"""
insert into core.organizations (id,name) values ('{ORG}','اختبار ج'),('{ORG2}','اختبار د');
insert into core.business_settings (organization_id) values ('{ORG}'),('{ORG2}');
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('{ADMIN}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ad@t','x',now(),now(),now()),
       ('{TLR}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t1@t','x',now(),now(),now()),
       ('{TLR2}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t2@t','x',now(),now(),now());
insert into core.profiles (id,full_name) values ('{ADMIN}','أدمن'),('{TLR}','خياط مسند'),('{TLR2}','خياط آخر');
insert into core.organization_members (organization_id,user_id,role)
values ('{ORG}','{ADMIN}','admin'),('{ORG}','{TLR}','tailor'),('{ORG}','{TLR2}','tailor');
insert into core.customers (id,organization_id,full_name,phone) values ('{CUST}','{ORG}','زبون','05');
insert into core.projects (id,organization_id,customer_id,code,status_code,tailor_id)
values ('{PROJ}','{ORG}','{CUST}','C-1','with_tailor','{TLR}');
insert into core.fabric_products (id,organization_id,name,kind,width_cm) values ('{PROD}','{ORG}','كريب','crepe',280);
insert into core.fabric_variants (id,organization_id,product_id,color_name,sku,cost_per_meter_agorot)
values ('{VAR}','{ORG}','{PROD}','بيج','C1',1400);
insert into core.fabric_rolls (id,organization_id,variant_id,code,initial_meters)
values ('{ROLL}','{ORG}','{VAR}','CR-900',100);
insert into core.stock_movements (organization_id,roll_id,type,quantity_m,created_by,idempotency_key)
values ('{ORG}','{ROLL}','receipt',100,'{ADMIN}',gen_random_uuid());
-- حجزان على نفس الرول: يكشفان لو أكلت زيادة أحدهما من الآخر
insert into core.fabric_reservations (id,organization_id,project_id,roll_id,quantity_m,created_by)
values ('{RES1}','{ORG}','{PROJ}','{ROLL}',20,'{ADMIN}'),
       ('{RES2}','{ORG}','{PROJ}','{ROLL}',30,'{ADMIN}');
insert into core.stock_movements (organization_id,roll_id,type,quantity_m,project_id,reservation_id,created_by,idempotency_key)
values ('{ORG}','{ROLL}','reservation',20,'{PROJ}','{RES1}','{ADMIN}',gen_random_uuid()),
       ('{ORG}','{ROLL}','reservation',30,'{PROJ}','{RES2}','{ADMIN}',gen_random_uuid());
select 'ok';
"""
if 'ERROR' in sql(seed):
    print(sql(seed)); sys.exit('seed failed')

oh, rs, av = invariants('بعد البذرة')
check('البداية: 100 / 50 / 50', (oh, rs, av) == (100.0, 50.0, 50.0), f'{oh}/{rs}/{av}')

K = lambda n: f'cccc1111-0000-4000-8000-{n:012d}'

print('\n=== consume_fabric ===')

r = as_user(TLR2, f"select api.consume_fabric('{RES1}',5,'{K(1)}');")
check('خياط غير مسند يُرفض (BD403)', 'الخياط المسند' in r, r)

r = as_user(TLR, f"select api.consume_fabric('{RES1}',8,'{K(2)}');")
check('1) استهلاك 8 < الحجز 20', '"consumed_from_reservation_m": 8' in r.replace(' :', ':'), r)
oh, rs, av = invariants('بعد استهلاك 8')
check('★ المتاح لم يتغير (الاستهلاك المخطط)', av == 50.0, f'available={av} (متوقع 50)')
check('  on_hand نزل إلى 92', oh == 92.0, f'{oh}')
check('  reserved نزل إلى 42', rs == 42.0, f'{rs}')

r = as_user(TLR, f"select api.consume_fabric('{RES1}',12,'{K(3)}');")
check('2) استهلاك 12 = المتبقي بالضبط', '"remaining_reserved_quantity_m": 0' in r.replace(' :', ':'), r)
st = sql(f"select status from core.fabric_reservations where id='{RES1}';")
check('  حالة الحجز صارت consumed', 'consumed' in st and 'partially' not in st, st)
oh, rs, av = invariants('بعد استهلاك الحجز كاملًا')
check('★ المتاح ما زال 50', av == 50.0, f'available={av}')

r = as_user(TLR, f"select api.consume_fabric('{RES2}',35,'{K(4)}');")
check('4) زيادة بلا سبب تُرفض (BD400)', 'السبب إلزامي' in r, r)

r = as_user(TLR, f"select api.consume_fabric('{RES2}',999,'{K(5)}','سبب');")
check('5) زيادة أكبر من الموجود تُرفض (BD422)', 'أكبر من الموجود' in r, r)

r = as_user(TLR, f"select api.consume_fabric('{RES2}',35,'{K(6)}','خطأ قص');")
check('3) استهلاك 35 من حجز 30 بسبب — زيادة 5', '"overconsumed_quantity_m": 5' in r.replace(' :', ':'), r)
check('  إشعار الأدمن أُنشئ', '"admin_notification_created": true' in r.replace(' :', ':'), r)
n = sql(f"select count(*) from core.notifications where organization_id='{ORG}';")
check('  صف الإشعار موجود فعلًا', ' 1' in n, n)

oh, rs, av = invariants('بعد الزيادة')
check('★ الزيادة خفضت on_hand و available معًا', oh == 45.0 and av == 45.0, f'on_hand={oh} available={av}')
check('★ reserved صار 0 — ولم تأكل الزيادة من حجز آخر', rs == 0.0, f'reserved={rs}')

mv = sql(f"""select type, quantity_m from core.stock_movements
  where roll_id='{ROLL}' and type in ('consumption','overconsumption') and quantity_m in (30,5)
  order by created_at;""")
check('  حركتان منفصلتان: consumption 30 و overconsumption 5',
      'overconsumption' in mv and ' 5.000' in mv and 'adjustment_out' not in mv, mv)

grp = sql(f"""select count(distinct operation_group_id) as groups,
                     count(*) as rows,
                     count(*) filter (where operation_group_id is null) as nulls
  from core.stock_movements
  where roll_id='{ROLL}' and type in ('consumption','overconsumption') and quantity_m in (30,5);""")
gn = [t for t in grp.replace('|', ' ').split() if t.isdigit()]
check('  الحركتان تحملان operation_group_id نفسه',
      gn[:3] == ['1', '2', '0'], grp)

oc = sql(f"""select (reservation_id is not null)::text || '|' ||
                    (length(btrim(reason)) > 0)::text || '|' ||
                    (project_id is not null)::text
  from core.stock_movements where roll_id='{ROLL}' and type='overconsumption';""")
check('  overconsumption تحمل الحجز والمشروع والسبب', 'true|true|true' in oc, oc)

r2 = as_user(TLR, f"select api.consume_fabric('{RES2}',35,'{K(6)}','خطأ قص');")
check('8) إعادة نفس المفتاح تعيد النتيجة', '"was_replayed": true' in r2.replace(' :', ':'), r2)
c = sql(f"select count(*) from core.fabric_usage where organization_id='{ORG}';")
check('  لم يُنشأ سجل استهلاك ثانٍ', ' 3' in c, c)

r = as_user(TLR, f"select api.consume_fabric('{RES2}',1,'{K(6)}','آخر');")
check('9) نفس المفتاح بحمولة مختلفة يُرفض', 'بمدخلات مختلفة' in r, r)

r = as_user(TLR, f"select api.consume_fabric('{RES2}',35,'{K(6)}','سبب آخر تمامًا');")
check('9b) نفس المفتاح والكمية بسبب مختلف يُرفض (السبب في البصمة)',
      'بمدخلات مختلفة' in r, r)

sql(f"update core.projects set notes = notes || '.' where id='{PROJ}';")
r = as_user(TLR, f"select api.consume_fabric('{RES2}',35,'{K(6)}','خطأ قص',1);")
check('9c) إعادة طلب ناجح تعمل رغم تغيّر إصدار المشروع',
      '"was_replayed": true' in r.replace(' :', ':'), r)

print('\n=== دلالة planned_m لكل حدث ===')
pm = sql(f"""select string_agg(planned_m::text, ',' order by created_at)
  from core.fabric_usage where reservation_id='{RES1}';""")
check('★ planned_m لكل حدث: 8 ثم 12 (لا 20 ثم 12)', '8.000,12.000' in pm, pm)

ps = sql(f"select sum(planned_m) from core.fabric_usage where reservation_id='{RES1}';")
check('★ Σplanned = المحجوز الأصلي (20)', '20.000' in ps, ps)

po = sql(f"""select planned_m::text || '|' || actual_m::text || '|' || waste_m::text
  from core.fabric_usage where reservation_id='{RES2}';""")
check('★ صف الزيادة: planned 30 · actual 35 · waste 5 (actual = planned + waste)',
      '30.000|35.000|5.000' in po, po)

print('\n=== سلامة movement_effects مفروضة لا متفق عليها ===')
cov = sql("""select count(*) from unnest(enum_range(null::core.movement_type)) t
  where not exists (select 1 from core.movement_effects e where e.type = t);""")
check('كل قيمة enum لها صف في movement_effects', ' 0' in cov, cov)

fk = sql("""select count(*) from pg_constraint
  where conname = 'stock_movements_type_effects_fk' and contype = 'f';""")
check('قيد FK من stock_movements.type إلى movement_effects قائم', ' 1' in fk, fk)

orphan = sql(f"""insert into core.stock_movements
  (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
   reason, created_by, idempotency_key)
  values ('{ORG}','{ROLL}','overconsumption',1,'{PROJ}',null,
          'زيادة يتيمة','{ADMIN}',gen_random_uuid());""")
check('overconsumption بلا حجز مرفوضة من المحرّك — حتى كـpostgres',
      'reservation_required' in orphan, orphan)

badeq = sql(f"""insert into core.fabric_usage
  (organization_id, project_id, reservation_id, roll_id,
   planned_m, actual_m, waste_m, reason, created_by)
  values ('{ORG}','{PROJ}','{RES1}','{ROLL}',10,10,3,'معادلة مكسورة','{ADMIN}');""")
check('معادلة fabric_usage مفروضة: actual ≠ planned + waste يُرفض',
      'usage_actual_equals_planned_plus_waste' in badeq, badeq)

print('\n=== عقود الإرجاع والتلف (الترحيلات 0029–0031) ===')

sm = sql("""select
  private.reservation_status_for(10,10,0,0) || '|' ||
  private.reservation_status_for(10,0,10,0) || '|' ||
  private.reservation_status_for(10,3,3,4)  || '|' ||
  private.reservation_status_for(10,0,0,10) || '|' ||
  private.reservation_status_for(10,2,0,0)  || '|' ||
  private.reservation_status_for(10,0,2,3);""")
check('آلة الحالة: نقي→consumed/released، مختلط/تلف→closed، جزئي→partial/active',
      'consumed|released|closed|closed|partially_consumed|active' in sm, sm)

orph_ret = sql(f"""insert into core.stock_movements
  (organization_id, roll_id, type, quantity_m, project_id, created_by, idempotency_key)
  values ('{ORG}','{ROLL}','return',1,'{PROJ}','{ADMIN}',gen_random_uuid());""")
check('return بلا سجل استهلاك مرفوض (return_requires_usage)',
      'return_requires_usage' in orph_ret, orph_ret)

usage_row = sql(f"""select id || '|' || roll_id from core.fabric_usage
  where reservation_id='{RES1}' order by created_at limit 1;""")
uid_roll = [l for l in usage_row.splitlines() if '|' in l]
USAGE1 = uid_roll[0].split('|')[0].strip() if uid_roll else ''

wrong_roll = sql(f"""insert into core.fabric_rolls (id,organization_id,variant_id,code,initial_meters)
  values ('cccc0000-0000-4000-8000-0000000000ee','{ORG}','{VAR}','CR-901',10);
insert into core.stock_movements
  (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
   fabric_usage_id, reason, created_by, idempotency_key)
  values ('{ORG}','cccc0000-0000-4000-8000-0000000000ee','return',1,'{PROJ}','{RES1}',
          '{USAGE1}','إرجاع لرول مختلف','{ADMIN}',gen_random_uuid());""")
check('إرجاع إلى رول غير رول الاستهلاك مرفوض من المحرّك (FK الخماسي)',
      'stock_movements_usage_consistency_fk' in wrong_roll, wrong_roll)

dmg_orphan = sql(f"""insert into core.stock_movements
  (organization_id, roll_id, type, quantity_m, project_id, created_by, idempotency_key, reason)
  values ('{ORG}','{ROLL}','damage_reserved',1,'{PROJ}','{ADMIN}',gen_random_uuid(),'تلف');""")
check('damage_reserved بلا حجز مرفوضة (reservation_required)',
      'reservation_required' in dmg_orphan, dmg_orphan)

dmg_noreason = sql(f"""insert into core.stock_movements
  (organization_id, roll_id, type, quantity_m, project_id, reservation_id,
   created_by, idempotency_key, reason)
  values ('{ORG}','{ROLL}','damage_reserved',1,'{PROJ}','{RES1}',
          '{ADMIN}',gen_random_uuid(),'');""")
check('damage_reserved بلا سبب مرفوضة (reason_required)',
      'reason_required_for_exceptions' in dmg_noreason, dmg_noreason)

print('\n=== damaged_reserved_m — الـinvariant الموسّع ===')
DMG = 'cccc0000-0000-4000-8000-0000000000f9'
sql(f"""insert into core.fabric_reservations (id,organization_id,project_id,roll_id,quantity_m,created_by)
values ('{DMG}','{ORG}','{PROJ}','{ROLL}',10,'{ADMIN}');
insert into core.stock_movements (organization_id,roll_id,type,quantity_m,project_id,reservation_id,created_by,idempotency_key)
values ('{ORG}','{ROLL}','reservation',10,'{PROJ}','{DMG}','{ADMIN}',gen_random_uuid());
update core.fabric_reservations set damaged_reserved_m = 4 where id='{DMG}';""")

rem = sql(f"select private.reservation_remaining('{DMG}');")
check('التالف يدخل في حساب المتبقي (10 − 4 = 6)', ' 6.000' in rem, rem)

r = as_user(ADMIN, f"select api.release_reservation('{DMG}',7,'فائض','{K(40)}');")
check('التحرير محدود بالمتبقي بعد التلف (7 > 6 يُرفض)', 'أكبر من المتبقي' in r, r)

viol = sql(f"update core.fabric_reservations set consumed_m = 7 where id='{DMG}';")
check('قيد invariant يرفض consumed+released+damaged > quantity',
      'reservation_balance_invariant' in viol, viol)

r = as_user(ADMIN, f"select api.release_reservation('{DMG}',6,'إغلاق بعد تلف','{K(41)}');")
check('تحرير كامل المتبقي بعد تلف → closed (لا consumed ولا released)',
      '"reservation_status": "closed"' in r.replace(' :', ':'), r)

r = as_user(ADMIN, f"select api.release_reservation('{DMG}',1,'محاولة بعد الإغلاق','{K(42)}');")
check('الحجز المغلق لا يُعاد فتحه', 'مغلق' in r, r)

print('\n=== 11) فشل التدقيق يسبب تراجعًا كاملًا ===')
sql(f"""insert into core.fabric_reservations (id,organization_id,project_id,roll_id,quantity_m,created_by)
values ('cccc0000-0000-4000-8000-0000000000f3','{ORG}','{PROJ}','{ROLL}',10,'{ADMIN}');
insert into core.stock_movements (organization_id,roll_id,type,quantity_m,project_id,reservation_id,created_by,idempotency_key)
values ('{ORG}','{ROLL}','reservation',10,'{PROJ}','cccc0000-0000-4000-8000-0000000000f3','{ADMIN}',gen_random_uuid());
create or replace function pg_temp_fail() returns trigger language plpgsql as $x$
begin raise exception 'حقن فشل تدقيق للاختبار'; end $x$;
create trigger tmp_audit_fail before insert on core.audit_logs
for each row when (new.action = 'inventory.consume') execute function pg_temp_fail();""")
before = sql(f"select count(*) from core.stock_movements where roll_id='{ROLL}';")
r = as_user(TLR, f"select api.consume_fabric('cccc0000-0000-4000-8000-0000000000f3',5,'{K(11)}');")
after = sql(f"select count(*) from core.stock_movements where roll_id='{ROLL}';")
sql("drop trigger tmp_audit_fail on core.audit_logs; drop function pg_temp_fail();")
check('11) فشل التدقيق ألغى الحركة كاملة', before.strip() == after.strip(),
      f'before={before.strip()} after={after.strip()}')

print('\n=== release_reservation ===')
RES3 = 'cccc0000-0000-4000-8000-0000000000f3'
oh0, rs0, av0 = balances()

r = as_user(ADMIN, f"select api.release_reservation('{RES3}',4,'تغيير تصميم','{K(20)}');")
check('1) تحرير جزئي 4 م', '"released_quantity_m": 4' in r.replace(' :', ':'), r)
oh, rs, av = invariants('بعد التحرير الجزئي')
check('★ 8) on_hand لم يتغير', oh == oh0, f'{oh0} → {oh}')
check('★ 9) available ارتفع 4 بالضبط', av == av0 + 4, f'{av0} → {av}')
check('  reserved نزل 4', rs == rs0 - 4, f'{rs0} → {rs}')

r = as_user(ADMIN, f"select api.release_reservation('{RES3}',99,'كثير','{K(21)}');")
check('3) تحرير أكبر من المتبقي يُرفض (BD422)', 'أكبر من المتبقي' in r, r)

r2 = as_user(ADMIN, f"select api.release_reservation('{RES3}',4,'تغيير تصميم','{K(20)}');")
check('6) idempotency replay', '"was_replayed": true' in r2.replace(' :', ':'), r2)

r = as_user(ADMIN, f"select api.release_reservation('{RES3}',2,'تغيير تصميم','{K(20)}');")
check('7) payload mismatch يُرفض', 'بمدخلات مختلفة' in r, r)

r = as_user(ADMIN, f"select api.release_reservation('{RES3}',4,'سبب مختلف','{K(20)}');")
check('7b) نفس المفتاح والكمية بسبب مختلف يُرفض', 'بمدخلات مختلفة' in r, r)

r = as_user(ADMIN, f"select api.release_reservation('{RES3}',4,'تغيير تصميم','{K(20)}','ملاحظة جديدة');")
check('7c) نفس المفتاح بملاحظات مختلفة يُرفض (الملاحظات في البصمة)',
      'بمدخلات مختلفة' in r, r)

sql(f"update core.projects set notes = notes || '.' where id='{PROJ}';")
r = as_user(ADMIN, f"select api.release_reservation('{RES3}',4,'تغيير تصميم','{K(20)}',null,1);")
check('7d) إعادة تحرير ناجح تعمل رغم تغيّر إصدار المشروع',
      '"was_replayed": true' in r.replace(' :', ':'), r)

r = as_user(ADMIN, f"select api.release_reservation('{RES3}',6,'إلغاء','{K(22)}');")
check('2) تحرير كامل للمتبقي', '"reservation_status": "released"' in r.replace(' :', ':'), r)
r = as_user(ADMIN, f"select api.release_reservation('{RES3}',1,'مرة أخرى','{K(23)}');")
check('  الحجز المحرَّر لا يُعاد فتحه', 'لا يُعاد فتحه' in r, r)

r = as_user(ADMIN, f"select api.release_reservation('{RES1}',1,'مستهلك','{K(24)}');")
check('4) تحرير من حجز مستهلك بالكامل يُرفض', 'أكبر من المتبقي' in r, r)

print('\n=== 10) التزامن: تحريران متوازيان لنفس الكمية ===')
sql(f"""insert into core.fabric_reservations (id,organization_id,project_id,roll_id,quantity_m,created_by)
values ('cccc0000-0000-4000-8000-0000000000f4','{ORG}','{PROJ}','{ROLL}',10,'{ADMIN}');
insert into core.stock_movements (organization_id,roll_id,type,quantity_m,project_id,reservation_id,created_by,idempotency_key)
values ('{ORG}','{ROLL}','reservation',10,'{PROJ}','cccc0000-0000-4000-8000-0000000000f4','{ADMIN}',gen_random_uuid());""")
race = ("set role postgres;\n"
        "select set_config('request.jwt.claims','{\"sub\":\"UID\",\"role\":\"authenticated\"}',false) \\g /dev/null\n"
        "set role authenticated;\n"
        "select api.release_reservation('cccc0000-0000-4000-8000-0000000000f4',10,'سباق','KEY');\n")
for tag, k in (('A', K(30)), ('B', K(31))):
    put_text(race.replace('UID', ADMIN).replace('KEY', k), f'/tmp/rr_{tag}.sql')
out = run(f'docker exec -i {DB} psql -U postgres -q < /tmp/rr_A.sql > /tmp/rra 2>&1 & '
          f'docker exec -i {DB} psql -U postgres -q < /tmp/rr_B.sql > /tmp/rrb 2>&1 & '
          'wait; echo "=A="; cat /tmp/rra; echo "=B="; cat /tmp/rrb', timeout=180)
print(out[:900])
check('5) تحريران متزامنان: نجح واحد فقط', out.count('released_quantity_m') == 1,
      f'count={out.count("released_quantity_m")}')
invariants('بعد سباق التحرير')

print('\n=== cleanup ===')
sql(PURGE + 'select 1;')
run('rm -f /tmp/cr.sql /tmp/rr_A.sql /tmp/rr_B.sql /tmp/rra /tmp/rrb')

print(f'\n===== {len(passed)} passed, {len(failed)} failed =====')
for f in failed:
    print('  FAILED:', f)
sys.exit(1 if failed else 0)
