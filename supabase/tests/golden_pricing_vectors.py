"""Golden pricing vectors — الجانب SQL من عقد §10 بند 5، عبر المحرك الفعلي.

بقرار المراجعة: لا نسخة ثالثة من المعادلات. كل متجه من الثمانية يمر في
مسار الإنتاج نفسه — api.create_quotation_version ← اللقطة الذرية ←
private.price_project_windows ← البنود والتجميع — ثم تُقارن مخرجات النسخة
والبند المخزنة بالقيم القانونية في expo/domain/pricing.vectors.json
(نفس الملف الذي يفحصه bun test في جانب TS). أي فرق أغورة = فشل بوابة.
"""
import sys, os, json, re

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.environ.get('VPS_HELPER_DIR', HERE)
sys.path.insert(0, HELPER)
from vps import run, put_text  # noqa: E402

IID = os.environ.get('BAYTAK_INSTANCE_ID') or open(
    os.path.join(HELPER, 'instance_id.txt')).read().strip()
DB = os.environ.get('BAYTAK_DB_CONTAINER') or f'supabase-db-{IID}'

VECTORS = json.load(open(
    os.path.join(HERE, '..', '..', 'expo', 'domain', 'pricing.vectors.json'),
    encoding='utf-8'))
S = VECTORS['settings']

ORG   = 'aaaa5555-0000-4000-8000-000000000001'
ADMIN = 'aaaa5555-0000-4000-8000-0000000000a1'
CUST  = 'aaaa5555-0000-4000-8000-0000000000c1'
PRODC = 'aaaa5555-0000-4000-8000-0000000000e1'  # كريب
PRODO = 'aaaa5555-0000-4000-8000-0000000000e2'  # قماش آخر
VARC  = 'aaaa5555-0000-4000-8000-0000000000e3'  # كريب 1400
VARO  = 'aaaa5555-0000-4000-8000-0000000000e4'  # آخر 2000
VARL  = 'aaaa5555-0000-4000-8000-0000000000e5'  # بطانة خاصة 1100

passed, failed = [], []


def sql(text, quiet=True):
    put_text(text + '\n', '/tmp/gve.sql')
    return run(f'docker exec -i {DB} psql -U postgres {"-q" if quiet else ""} < /tmp/gve.sql 2>&1')


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


def pid(n): return f'aaaa5555-0000-4000-8000-0000000000d{n}'
def rid(n): return f'aaaa5555-0000-4000-8000-00000000f0d{n}'
def wid(n): return f'aaaa5555-0000-4000-8000-00000000e0d{n}'
def key(n): return f'aaaa5555-0000-4000-8000-00000000ee0{n}'


PURGE = f"""
set session_replication_role = replica;
delete from core.client_operations   where organization_id = '{ORG}';
delete from core.audit_logs          where organization_id = '{ORG}';
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
delete from core.profiles            where id = '{ADMIN}';
delete from auth.users               where id = '{ADMIN}';
set session_replication_role = origin;
"""

print('=== seeding ===')
rules_values = ",\n ".join(
    f"('{ORG}','{band}','{cat}',1,1)"
    for band in ('standard', 'tall')
    for cat in ('crepe_with_lining', 'crepe_without_lining',
                'other_with_lining', 'other_without_lining'))
out = sql(PURGE + f"""
insert into core.organizations (id,name) values ('{ORG}','متجهات المحرك');
insert into core.business_settings
  (organization_id, track_cost_per_meter_agorot, delivery_cost_per_meter_agorot,
   measure_install_cost_per_meter_agorot, lining_cost_per_meter_agorot,
   vat_percent, min_margin_percent,
   employee_discount_limit_percent, admin_discount_limit_percent)
values ('{ORG}', {S['trackCostPerMeterAgorot']}, {S['deliveryCostPerMeterAgorot']},
        {S['measureInstallCostPerMeterAgorot']}, 900, {S['vatPercent']}, 0, 100, 100);
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,
                        email_confirmed_at,created_at,updated_at)
values ('{ADMIN}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gve@t.local','x',now(),now(),now());
insert into core.profiles (id,full_name) values ('{ADMIN}','أدمن المتجهات');
insert into core.organization_members (organization_id,user_id,role)
values ('{ORG}','{ADMIN}','admin');
insert into core.customers (id,organization_id,full_name,phone)
values ('{CUST}','{ORG}','زبون المتجهات','05');
insert into core.fabric_products (id,organization_id,name,kind,width_cm) values
 ('{PRODC}','{ORG}','كريب','crepe',280),
 ('{PRODO}','{ORG}','مخمل','other',280);
insert into core.fabric_variants (id,organization_id,product_id,color_name,sku,cost_per_meter_agorot) values
 ('{VARC}','{ORG}','{PRODC}','بيج','GV-C',1400),
 ('{VARO}','{ORG}','{PRODO}','أزرق','GV-O',2000),
 ('{VARL}','{ORG}','{PRODC}','بطانة خاصة','GV-L',1100);
insert into core.pricing_rules (organization_id,band,category,customer_price_per_meter_agorot,tailor_cost_per_meter_agorot) values
 {rules_values};
""")
if 'ERROR' in out:
    print(out); sys.exit(1)

for n in range(1, len(VECTORS['vectors']) + 1):
    out = sql(f"""
insert into core.projects (id, organization_id, customer_id, code, status_code)
values ('{pid(n)}', '{ORG}', '{CUST}', 'GV-{n}', 'quotation');
insert into core.rooms (id, organization_id, project_id, name)
values ('{rid(n)}', '{ORG}', '{pid(n)}', 'صالون');
insert into core.windows (id, organization_id, project_id, room_id, name,
        width_cm, height_cm, has_lining, fullness, quantity, fabric_variant_id)
values ('{wid(n)}', '{ORG}', '{pid(n)}', '{rid(n)}', 'شباك {n}',
        100, 250, false, 3, 1, '{VARC}');""")
    if 'ERROR' in out:
        print(out); sys.exit(1)
print('seeded')

for idx, v in enumerate(VECTORS['vectors'], start=1):
    i, e = v['input'], v['expected']
    fabric_var = VARO if i['fabricCostAgorot'] == 2000 else VARC
    lining_var = f"'{VARL}'" if i['liningCostAgorot'] == 1100 else 'null'

    # تهيئة قواعد المؤسسة وشباك المتجه — ثم المسار الإنتاجي كاملًا
    out = sql(f"""
update core.pricing_rules
   set customer_price_per_meter_agorot = {i['unitPriceAgorot']},
       tailor_cost_per_meter_agorot   = {i['tailorCostAgorot']}
 where organization_id = '{ORG}';
update core.windows
   set width_cm = {i['widthCm']}, quantity = {i['quantity']},
       fullness = {i['fullness']}, has_lining = {str(i['hasLining']).lower()},
       fabric_variant_id = '{fabric_var}', lining_variant_id = {lining_var}
 where id = '{wid(idx)}';""")
    if 'ERROR' in out:
        check(f"vector via engine: {v['name']}", False, out); continue

    out = as_user(ADMIN, f"""select api.create_quotation_version(
      '{pid(idx)}'::uuid, {i['discountPercent']}, '', '{key(idx)}'::uuid)::text;""")
    m = re.search(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
    if not m:
        check(f"vector via engine: {v['name']}", False, out); continue
    ver = m.group(1)

    probe = sql(f"""select i.running_meters::text || '|' || i.fabric_meters::text
 || '|' || i.lining_meters::text || '|' || i.line_total_agorot
 || '|' || i.internal_cost_agorot || '|' || i.unit_price_agorot
 || '|' || v.subtotal_agorot || '|' || v.discount_agorot
 || '|' || v.total_agorot || '|' || v.vat_agorot
 || '|' || (v.total_agorot - v.vat_agorot) || '|' || v.margin_percent::text
from core.quotation_items i
join core.quotation_versions v on v.id = i.version_id
where i.version_id = '{ver}';""", quiet=False)

    expected = '|'.join([
        f"{e['runningMeters']:.3f}", f"{e['fabricMeters']:.3f}", f"{e['liningMeters']:.3f}",
        str(e['lineTotalAgorot']), str(e['internalCostAgorot']),
        str(i['unitPriceAgorot']),
        str(e['subtotalAgorot']), str(e['discountAgorot']),
        str(e['totalAgorot']), str(e['vatAgorot']),
        str(e['revenueExVatAgorot']), f"{e['marginPercent']:.2f}",
    ])
    check(f"vector via engine: {v['name']}", expected in probe,
          f'expected: {expected}\n     got: {probe}')

print('\n=== cleanup ===')
sql(PURGE)
print('purged')

print(f'\n===== النتيجة: نجح {len(passed)} / فشل {len(failed)} =====')
if failed:
    for f in failed:
        print('FAILED:', f)
    sys.exit(1)
