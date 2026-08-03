"""Golden pricing vectors — الجانب SQL من عقد §10 بند 5.

نفس المتجهات في expo/domain/pricing.vectors.json تُفحص هنا عبر تعبيرات
numeric الدقيقة المطابقة حرفيًا لصيغ المحرك (private.price_project_windows
والتجميع في create_quotation_version)، وفي TS عبر bun test. أي فرق أغورة
واحد بين الجانبين = فشل بوابة.

(سلوك المحرك نفسه — الدوال الحية بربط جداولها — مغطى في quotation_rpcs.py
بأرقام دليل الفريق؛ هذا الملف يثبت أن دلالات الحساب والتقريب المشتركة
تعطي المخرجات القانونية نفسها.)
"""
import sys, os, json

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
passed, failed = [], []


def check(name, ok, detail=''):
    (passed if ok else failed).append(name)
    print(f'{"PASS" if ok else "FAIL"}  {name}')
    if not ok and detail:
        print('      ' + detail.strip().replace('\n', '\n      ')[:600])


for v in VECTORS['vectors']:
    i, e = v['input'], v['expected']
    lining_term = (f"+ ({i['liningCostAgorot']}::numeric * {i['fullness']}::numeric)"
                   if i['hasLining'] else '')
    lm_expr = 'fm' if i['hasLining'] else '0::numeric(12,3)'
    sql_text = f"""
with base as (
  select round({i['widthCm']}::numeric / 100 * {i['quantity']}, 3) as rm
), fab as (
  select rm, round(rm * {i['fullness']}::numeric, 3) as fm from base
), line as (
  select rm, fm, {lm_expr} as lm,
         round({i['unitPriceAgorot']}::numeric * rm)::bigint as line_total,
         round((
             ({i['fabricCostAgorot']}::numeric * {i['fullness']}::numeric)
             {lining_term}
             + {i['tailorCostAgorot']} + {S['trackCostPerMeterAgorot']}
             + {S['deliveryCostPerMeterAgorot']} + {S['measureInstallCostPerMeterAgorot']}
           ) * rm)::bigint as internal
  from fab
), tot as (
  select *,
         round(line_total * {i['discountPercent']}::numeric / 100)::bigint as discount
  from line
), net as (
  select *, (line_total - discount) as net_v from tot
), vat as (
  select *,
         (net_v - round(net_v / (1 + {S['vatPercent']}::numeric / 100))::bigint) as vat_v
  from net
)
select rm::text || '|' || fm::text || '|' || lm::text
  || '|' || line_total || '|' || internal
  || '|' || discount || '|' || net_v || '|' || vat_v
  || '|' || (net_v - vat_v)
  || '|' || case when (net_v - vat_v) > 0
       then round(((net_v - vat_v) - internal)::numeric / (net_v - vat_v) * 100, 2)::text
       else '0' end
from vat;
"""
    put_text(sql_text + '\n', '/tmp/gv.sql')
    out = run(f'docker exec -i {DB} psql -U postgres -tA < /tmp/gv.sql 2>&1').strip()

    def fmt3(x):
        return f'{x:.3f}'
    expected = '|'.join([
        fmt3(e['runningMeters']), fmt3(e['fabricMeters']), fmt3(e['liningMeters']),
        str(e['lineTotalAgorot']), str(e['internalCostAgorot']),
        str(e['discountAgorot']), str(e['totalAgorot']), str(e['vatAgorot']),
        str(e['revenueExVatAgorot']), f"{e['marginPercent']:.2f}",
    ])
    check(f"vector: {v['name']}", out == expected,
          f'expected: {expected}\n     got: {out}')

print(f'\n===== النتيجة: نجح {len(passed)} / فشل {len(failed)} =====')
if failed:
    for f in failed:
        print('FAILED:', f)
    sys.exit(1)
