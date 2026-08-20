"""اختبار دوال دورة حياة العروض الأربع (ترحيل 150001) — عقود §10 المصادَقة.

يغطي: أرقام دليل الفريق حرفيًا (rm=2 ← 58000/31800، ونسبة الربح 45.17 -
מע"מ تُضاف على المجموع منذ 9.8.2026)، دلالة المؤشر من اعتراض التصديق 1 (الإنشاء لا يحرك المؤشر
وعرضٌ مرسل قائم؛ الإرسال يستبدل ويحدّث ذريًا)، بوابتي الخصم والهامش على
السياق المجمّد، بصمة المحتوى fp1، الترقيم بلا سباق (تزامن حقيقي)،
الانقضاء، الصلاحيات، وidempotency v3.

ملاحظة تثبيت: min_margin في الإعدادات هنا 10 (لا 35) كي تختبر بوابةُ
الخصم نفسها لا بوابةُ نسبة الربح — قيم المثال الحرفية (45.17) تُفحص كقيم
محسوبة، وبوابة الهامش تُفحص بخصم 60%.
"""
import sys, os, re, json

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.environ.get('VPS_HELPER_DIR', HERE)
sys.path.insert(0, HELPER)
from vps import run, put_text  # noqa: E402

IID = os.environ.get('BAYTAK_INSTANCE_ID') or open(
    os.path.join(HELPER, 'instance_id.txt')).read().strip()
DB = os.environ.get('BAYTAK_DB_CONTAINER') or f'supabase-db-{IID}'

ORG   = 'aaaa3333-0000-4000-8000-000000000001'
ADMIN = 'aaaa3333-0000-4000-8000-0000000000a1'
SALES = 'aaaa3333-0000-4000-8000-0000000000a2'
TAILOR= 'aaaa3333-0000-4000-8000-0000000000a3'
CUST  = 'aaaa3333-0000-4000-8000-0000000000c1'
PRODC = 'aaaa3333-0000-4000-8000-0000000000e1'  # كريب
VARC  = 'aaaa3333-0000-4000-8000-0000000000e2'  # كلفة 1400 أغورة/م

passed, failed = [], []


def sql(text, quiet=True):
    put_text(text + '\n', '/tmp/qr.sql')
    return run(f'docker exec -i {DB} psql -U postgres {"-q" if quiet else ""} < /tmp/qr.sql 2>&1')


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


# مشاريع الاختبار: (لاحقة سداسية، كود)
PROJECTS = {
    'PA': 'd1', 'PB': 'd2', 'PC': 'd3', 'PD': 'd4', 'PE': 'd5',
    'PF': 'd6', 'PG': 'd7', 'PH': 'd8', 'PI': 'd9', 'PJ': 'da',
    'PK': 'db', 'PL': 'dc', 'PM': 'dd', 'PN': 'de',
}
def pid(k):  return f'aaaa3333-0000-4000-8000-0000000000{PROJECTS[k]}'
def rid(k):  return f'aaaa3333-0000-4000-8000-00000000f0{PROJECTS[k]}'
def wid(k):  return f'aaaa3333-0000-4000-8000-00000000e0{PROJECTS[k]}'

K = {n: f'aaaa4444-0000-4000-8000-0000000000{i:02x}' for i, n in enumerate([
    'a1','a2','a3','a4','a5','a6','a7','a8','a9','b1','b2','b3','b4','b5',
    'b6','b7','b8','b9','c1','c2','c3','c4','c5','c6','c7','c8'], start=1)}

PURGE = f"""
set session_replication_role = replica;
delete from core.client_operations   where organization_id = '{ORG}';
delete from core.audit_logs          where organization_id = '{ORG}';
delete from core.discount_requests   where organization_id = '{ORG}';
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

def project_fixture(k, code, height='250', with_lining='true', with_variant=True):
    variant = f"'{VARC}'" if with_variant else 'null'
    return f"""
insert into core.projects (id, organization_id, customer_id, code, status_code)
values ('{pid(k)}', '{ORG}', '{CUST}', '{code}', 'quotation');
insert into core.rooms (id, organization_id, project_id, name)
values ('{rid(k)}', '{ORG}', '{pid(k)}', 'صالون');
insert into core.windows (id, organization_id, project_id, room_id, name,
        width_cm, height_cm, has_lining, fullness, quantity, fabric_variant_id)
values ('{wid(k)}', '{ORG}', '{pid(k)}', '{rid(k)}', 'شباك رئيسي',
        200, {height}, {with_lining}, 3, 1, {variant});
"""

print('=== seeding ===')
seed = PURGE + f"""
insert into core.organizations (id,name) values ('{ORG}','اختبار دوال العروض');
insert into core.business_settings (organization_id, min_margin_percent)
values ('{ORG}', 10);
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,
                        email_confirmed_at,created_at,updated_at)
values ('{ADMIN}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','qra@t.local','x',now(),now(),now()),
       ('{SALES}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','qrs@t.local','x',now(),now(),now()),
       ('{TAILOR}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','qrt@t.local','x',now(),now(),now());
insert into core.profiles (id,full_name)
values ('{ADMIN}','أدمن'),('{SALES}','مبيعات'),('{TAILOR}','خياط');
insert into core.organization_members (organization_id,user_id,role)
values ('{ORG}','{ADMIN}','admin'),('{ORG}','{SALES}','sales'),('{ORG}','{TAILOR}','tailor');
insert into core.customers (id,organization_id,full_name,phone)
values ('{CUST}','{ORG}','زبون الدوال','05');
insert into core.fabric_products (id,organization_id,name,kind,width_cm)
values ('{PRODC}','{ORG}','كريب','crepe',280);
insert into core.fabric_variants (id,organization_id,product_id,color_name,sku,cost_per_meter_agorot)
values ('{VARC}','{ORG}','{PRODC}','بيج','CR-B',1400);
insert into core.pricing_rules (organization_id,band,category,customer_price_per_meter_agorot,tailor_cost_per_meter_agorot) values
 ('{ORG}','standard','crepe_with_lining',29000,4000),
 ('{ORG}','standard','crepe_without_lining',27000,4000),
 ('{ORG}','standard','other_without_lining',29000,4000),
 ('{ORG}','standard','other_with_lining',35000,4000),
 ('{ORG}','tall','crepe_with_lining',45000,7000),
 ('{ORG}','tall','crepe_without_lining',43000,7000),
 ('{ORG}','tall','other_without_lining',45000,7000),
 ('{ORG}','tall','other_with_lining',51000,7000);
""" + project_fixture('PA','QR-A') + project_fixture('PB','QR-B', height='520') \
    + project_fixture('PC','QR-C') + project_fixture('PD','QR-D') \
    + project_fixture('PE','QR-E') + project_fixture('PF','QR-F') \
    + project_fixture('PG','QR-G') + project_fixture('PH','QR-H') \
    + project_fixture('PI','QR-I') + project_fixture('PJ','QR-J') \
    + project_fixture('PK','QR-K') + project_fixture('PL','QR-L') \
    + project_fixture('PM','QR-M', with_variant=False) \
    + project_fixture('PN','QR-N')
out = sql(seed)
if 'ERROR' in out:
    print(out); sys.exit(1)
print('seeded')


def create(user, proj, key, disc='0', note=''):
    return as_user(user, f"""select api.create_quotation_version(
      '{pid(proj)}'::uuid, {disc}, '{note}', '{key}'::uuid)::text;""")

def send(user, ver, key):
    return as_user(user, f"""select api.send_quotation_version(
      '{ver}'::uuid, '{key}'::uuid)::text;""")

# ── أرقام الدليل الحرفية ─────────────────────────────────────────────────────
out = create(SALES, 'PA', K['a1'])
v1 = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
# מע"מ تُضاف على المجموع لا تُستخرَج منه (قرار المالك 9.8.2026):
# 58000 + floor(58000×18%)=10400 ← المطلوب 68400، ونسبة الربح على الإيراد
# الكامل: (58000−31800)/58000 = 45.17
ok = (v1 is not None
      and '"quotation_number": "Q-2026-0001"' in out
      and '"subtotal_agorot": 58000' in out
      and '"vat_agorot": 10400' in out
      and '"total_agorot": 68400' in out
      and '"margin_percent": 45.17' in out)
check('01 إنشاء v1: أرقام الدليل بقاعدة الشيكل الصحيح (58000 / מע"מ 10400 تُضاف / المطلوب 68400 / نسبة الربح 45.17)',
      ok, out)

probe = sql(f"""select running_meters || '|' || fabric_meters || '|' || lining_meters
 || '|' || unit_price_agorot || '|' || line_total_agorot || '|' || internal_cost_agorot
from core.quotation_items where version_id = '{v1}';""", quiet=False)
check('02 البند: rm=2 وقماش=6 وبطانة=6 وتكلفة 31800 (الفصل الثلاثي)',
      '2.000|6.000|6.000|29000|58000|31800' in probe, probe)

# ── idempotency v3 ───────────────────────────────────────────────────────────
out = create(SALES, 'PA', K['a1'])
check('03 الإعادة بنفس المفتاح والمدخلات ترجع النسخة ذاتها',
      '"was_replayed": true' in out and (v1 or 'x') in out, out)

out = create(SALES, 'PA', K['a1'], note='مختلفة')
check('04 نفس المفتاح بمدخلات مختلفة BD400', 'BD400' in out or 'مختلفة' in out, out)

# ── دلالة المؤشر (اعتراض التصديق 1) ─────────────────────────────────────────
out = create(SALES, 'PA', K['a2'])
v2 = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
ok = v2 and '"pointer_moved": true' in out and f'"superseded_draft_id": "{v1}"' in out
check('05 إنشاء v2: المسودة v1 مستبدلة والمؤشر انتقل (كان على مسودة)', bool(ok), out)

out = send(SALES, v2, K['a3'])
check('06 إرسال v2 نجح', '"was_replayed": false' in out and 'ERROR' not in out, out)

out = create(SALES, 'PA', K['a4'])
v3 = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
ok = v3 and '"pointer_moved": false' in out
check('07 إنشاء v3 وعرضٌ مرسل قائم: المؤشر لم يتحرك (يبقى على المرسلة)', bool(ok), out)

probe = sql(f"""select q.status || '|' || (q.current_version_id = '{v2}')
from core.quotations q where q.project_id = '{pid('PA')}';""", quiet=False)
check('08 الأب sent والمؤشر على v2 رغم وجود مسودة v3', 'sent|t' in probe, probe)

out = as_user(SALES, f"""select api.approve_quotation_version(
  '{v3}'::uuid, '{K['a5']}'::uuid)::text;""")
check('09 اعتماد v3 (ليست الحالية) BD409', 'BD409' in out or 'الحالية' in out, out)

out = send(SALES, v3, K['a6'])
check('10 إرسال v3: يستبدل v2 المرسلة ذريًا',
      f'"superseded_sent_id": "{v2}"' in out and 'ERROR' not in out, out)

probe = sql(f"""select status || '|' || (sent_at is not null) || '|' || (superseded_at is not null)
from core.quotation_versions where id = '{v2}';""", quiet=False)
check('11 v2 مستبدلة وأختام إرسالها الحقيقية باقية', 'superseded|true|true' in probe, probe)

# ── الاعتماد يحرّك المشروع ذريًا ─────────────────────────────────────────────
out = as_user(SALES, f"""select api.approve_quotation_version(
  '{v3}'::uuid, '{K['a7']}'::uuid, 'وافق هاتفيًا')::text;""")
check('12 اعتماد v3 نجح', '"project_status": "customer_approved"' in out, out)

probe = sql(f"""select p.status_code || '|' || q.status || '|' || v.status
from core.projects p
join core.quotations q on q.project_id = p.id
join core.quotation_versions v on v.id = q.current_version_id
where p.id = '{pid('PA')}';""", quiet=False)
check('13 المشروع customer_approved والأب والنسخة approved',
      'customer_approved|approved|approved' in probe, probe)

out = create(SALES, 'PA', K['a8'])
check('14 لا نسخ جديدة بعد الاعتماد BD409 (حارس حالة المشروع يسبق حارس النسخ)',
      'والمشروع في حالة' in out or 'معتمد' in out, out)

# ── الصلاحيات والحواف ────────────────────────────────────────────────────────
out = create(TAILOR, 'PD', K['a9'])
check('15 الخياط لا ينشئ عروضًا BD403', 'BD403' in out or 'دورك' in out, out)

out = create(SALES, 'PB', K['b1'])
check('16 فوق 500 سم BD422 بلا تسعير تلقائي', 'BD422' in out or 'تسعيرة خاصة' in out, out)

out = create(SALES, 'PM', K['b2'])
check('17 شباك بلا قماش محدد BD422', 'BD422' in out or 'بلا قماش' in out, out)

# ── الرفض: الملاحظة إلزامية وجائز على المنقضية ──────────────────────────────
out = create(SALES, 'PC', K['b3']); vc = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
send(SALES, vc, K['b4'])
out = as_user(SALES, f"""select api.reject_quotation_version(
  '{vc}'::uuid, '{K['b5']}'::uuid, '')::text;""")
check('18 رفض بلا ملاحظة BD422', 'BD422' in out or 'إلزامية' in out, out)

out = as_user(SALES, f"""select api.reject_quotation_version(
  '{vc}'::uuid, '{K['b5']}'::uuid, 'السعر مرتفع للزبون')::text;""")
check('19 الرفض الموثق نجح', '"decision_note": "السعر مرتفع للزبون"' in out, out)

probe = sql(f"""select q.status || '|' || p.status_code
from core.quotations q join core.projects p on p.id = q.project_id
where q.project_id = '{pid('PC')}';""", quiet=False)
check('20 بعد الرفض: الأب rejected والمشروع باقٍ quotation (إعادة العرض ممكنة)',
      'rejected|quotation' in probe, probe)

# ── بوابات الخصم على السياق المجمّد ──────────────────────────────────────────
out = create(SALES, 'PD', K['b6'], disc='4'); vd = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
out = send(SALES, vd, K['b7'])
check('21 sales بخصم 4% ≤ حد الموظف يمرّ مباشرة', 'ERROR' not in out and '"was_replayed": false' in out, out)

out = create(SALES, 'PE', K['b8'], disc='7'); ve = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
out = send(SALES, ve, K['b9'])
check('22 sales بخصم 7% بلا موافقة BD403', 'BD403' in out or 'معتمد' in out, out)

sql(f"""insert into core.discount_requests
  (organization_id, quotation_id, version_id, requested_percent, reason,
   status, requested_by, decided_by, decided_at, content_fingerprint)
select '{ORG}', v.quotation_id, v.id, 7, 'زبون قديم', 'approved',
       '{SALES}', '{ADMIN}', now(), private.version_content_fingerprint(v.id)
from core.quotation_versions v where v.id = '{ve}';""")
out = send(SALES, ve, K['c1'])
check('23 نفس الخصم بموافقة معتمدة (بصمة مطابقة) يمرّ', 'ERROR' not in out and 'fingerprint' in out, out)

out = create(SALES, 'PF', K['c2'], disc='7'); vf = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
sql(f"""insert into core.discount_requests
  (organization_id, quotation_id, version_id, requested_percent, reason,
   status, requested_by, decided_by, decided_at, content_fingerprint)
select '{ORG}', v.quotation_id, v.id, 7, 'سبب', 'approved',
       '{SALES}', '{ADMIN}', now(), 'stale-fingerprint-from-old-content'
from core.quotation_versions v where v.id = '{vf}';""")
out = send(SALES, vf, K['c3'])
check('24 موافقة ببصمة قديمة BD409 (تغيّر المحتوى يبطل الموافقة)',
      'BD409' in out or 'تغيّر محتوى' in out, out)

out = create(ADMIN, 'PH', K['c4'], disc='8'); vh = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
out = send(ADMIN, vh, K['c5'])
check('25 admin بخصم 8% ≤ حده يمرّ مباشرة بلا طلب', 'ERROR' not in out, out)

out = create(ADMIN, 'PG', K['c6'], disc='12'); vg = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
out = send(ADMIN, vg, K['c7'])
check('26 فوق حد الأدمن (12%) حتى للأدمن: بلا Override معتمد BD403',
      'يتجاوز صلاحيتك' in out, out)

sql(f"""insert into core.discount_requests
  (organization_id, quotation_id, version_id, requested_percent, reason,
   status, requested_by, decided_by, decided_at, content_fingerprint)
select '{ORG}', v.quotation_id, v.id, 12, 'صفقة استثنائية لمشروع كبير', 'approved',
       '{ADMIN}', '{ADMIN}', now(), private.version_content_fingerprint(v.id)
from core.quotation_versions v where v.id = '{vg}';""")
out = send(ADMIN, vg, K['c8'])
check('27 Override موثق (طلب معتمد فوق الحد) يمرّ — قاعدة الدليل',
      'ERROR' not in out, out)

# ── بوابة الهامش سقف مطلق ────────────────────────────────────────────────────
out = create(ADMIN, 'PI', 'aaaa4444-0000-4000-8000-0000000000fe', disc='60')
vi = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
sql(f"""insert into core.discount_requests
  (organization_id, quotation_id, version_id, requested_percent, reason,
   status, requested_by, decided_by, decided_at, content_fingerprint)
select '{ORG}', v.quotation_id, v.id, 60, 'اختبار الحد', 'approved',
       '{ADMIN}', '{ADMIN}', now(), private.version_content_fingerprint(v.id)
from core.quotation_versions v where v.id = '{vi}';""")
out = as_user(ADMIN, f"""select api.send_quotation_version(
  '{vi}'::uuid, 'aaaa4444-0000-4000-8000-0000000000ff'::uuid)::text;""")
check('28 الهامش الأدنى يحجب الإرسال BD422 حتى مع Override معتمد',
      'الهامش' in out and 'أقل من الحد الأدنى' in out, out)

# ── الانقضاء: الاعتماد يُرفض والرفض جائز ─────────────────────────────────────
out = create(SALES, 'PJ', 'aaaa4444-0000-4000-8000-00000000e001')
vj = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
send(SALES, vj, 'aaaa4444-0000-4000-8000-00000000e002')
sql(f"""set session_replication_role = replica;
update core.quotation_versions set valid_until = now() - interval '1 day'
 where id = '{vj}';
set session_replication_role = origin;""")
out = as_user(SALES, f"""select api.approve_quotation_version(
  '{vj}'::uuid, 'aaaa4444-0000-4000-8000-00000000e003'::uuid)::text;""")
check('29 اعتماد نسخة منقضية BD409', 'BD409' in out or 'انتهت صلاحية' in out, out)

out = as_user(SALES, f"""select api.reject_quotation_version(
  '{vj}'::uuid, 'aaaa4444-0000-4000-8000-00000000e004'::uuid, 'رفض بعد انتهاء الصلاحية')::text;""")
check('30 رفض نسخة منقضية جائز (تسجيل واقعة)',
      'ERROR' not in out and '"version_id"' in out, out)

# ── سباق الترقيم: إنشاءان متوازيان لعرضين أولين ─────────────────────────────
r1 = f"""set role postgres;
select set_config('request.jwt.claims','{{"sub":"{SALES}","role":"authenticated"}}',false) \\g /dev/null
set role authenticated;
select api.create_quotation_version('{pid('PK')}'::uuid, 0, '', 'aaaa4444-0000-4000-8000-00000000e005'::uuid)::text;"""
r2 = r1.replace(pid('PK'), pid('PL')).replace('e005', 'e006')
put_text(r1 + '\n', '/tmp/race1.sql')
put_text(r2 + '\n', '/tmp/race2.sql')
out = run(f'docker exec -i {DB} psql -U postgres < /tmp/race1.sql > /tmp/race1.out 2>&1 & '
          f'docker exec -i {DB} psql -U postgres < /tmp/race2.sql > /tmp/race2.out 2>&1 & '
          f'wait; cat /tmp/race1.out /tmp/race2.out')
nums = re.findall(r'Q-2026-(\d{4})', out)
ok = len(nums) >= 2 and len(set(nums)) == len(nums) and 'ERROR' not in out
check('31 سباق الترقيم: إنشاءان متوازيان ← رقمان مميزان بلا خطأ', ok, out)

# ── البصمة القانونية fp1 ─────────────────────────────────────────────────────
probe = sql(f"""select (private.version_content_fingerprint('{v3}')
        = private.version_content_fingerprint('{v3}'))::text
 || '|' || length(private.version_content_fingerprint('{v3}'))
 || '|' || left(private.quotation_content_canonical('{v3}'), 24);""", quiet=False)
check('32 بصمة حتمية 64-hex وبادئة fp1|ILS|2|exclusive (نسخة الحساب 2، מע"מ تُضاف)',
      'true|64|fp1|ILS|2|exclusive' in probe, probe)

# ── اللقطة الذرية: المحرك يقرأ من السياق لا من الجداول الحية ─────────────────
# سياق مُفتعل بسعر 99999 بينما القاعدة الحية 29000 — إن خرج 199998 فالمحرك
# يقرأ اللقطة الملتقطة حصرًا (إغلاق اعتراض «اللقطة غير الذرية» بالدليل).
probe = sql(f"""select line_total_agorot || '|' || internal_cost_agorot
from private.price_project_windows('{ORG}'::uuid, '{pid('PA')}'::uuid,
  jsonb_build_object(
    'settings', jsonb_build_object(
      'track_cost_per_meter_agorot', 0, 'delivery_cost_per_meter_agorot', 0,
      'measure_install_cost_per_meter_agorot', 0, 'lining_cost_per_meter_agorot', 0),
    'rules', jsonb_build_array(jsonb_build_object(
      'band','standard','category','crepe_with_lining',
      'customer_price_per_meter_agorot', 99999,
      'tailor_cost_per_meter_agorot', 0))));""", quiet=False)
# 99999 × 2 م = 199998 أغورة، وبقاعدة الشيكل الصحيح تُسقَط الكسور ← 199900
check('33 المحرك يسعّر من اللقطة المفتعلة (99999) لا من القاعدة الحية (29000)',
      '199900|' in probe, probe)

probe = sql(f"""select (i.unit_price_agorot = (r->>'customer_price_per_meter_agorot')::bigint)::text
from core.quotation_items i
join core.quotation_versions v on v.id = i.version_id,
lateral jsonb_array_elements(v.pricing_context->'rules') r
where i.version_id = '{v3}'
  and r->>'band' = i.band::text and r->>'category' = i.category::text;""", quiet=False)
check('34 اتساق ذاتي: سعر البند = القاعدة المخزنة داخل pricing_context نفسها',
      'true' in probe, probe)

# ── الحيلة التسويقية: list_price عرضٌ فقط، لا يمسّ المجموع ولا الربح ──────────
# PA بندٌ واحد crepe_with_lining، line_total = 58000. زيادة 15% ← المشطوب
# floorToShekel(round(58000×115/100)) = 66700
out = as_user(SALES, f"""select api.create_quotation_version(
  '{pid('PN')}'::uuid, 0, 'ملاحظة الزبون هنا', 'aaaa4444-0000-4000-8000-00000000f001'::uuid, null,
  '{{"mode":"percent","targets":{{"crepe_with_lining":15}}}}'::jsonb)::text;""")
vm = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
probe = sql(f"""select 'list=' || list_price_agorot || '|line=' || line_total_agorot
 from core.quotation_items where version_id = '{vm}';""", quiet=False)
check('35 زيادة 15% على تصنيف: list_price=66700 والسعر الحقيقي 58000',
      'ERROR' not in out and 'list=66700|line=58000' in probe, out + probe)

probe = sql(f"""select 'total=' || total_agorot || '|margin=' || margin_percent
 || '|markup=' || (markup_spec->'targets'->>'crepe_with_lining')
 || '|note=' || note
 from core.quotation_versions where id = '{vm}';""", quiet=False)
check('36 الزيادة لا تمسّ المجموع/الربح، وmarkup_spec والملاحظة محفوظان',
      'total=68400|margin=45.17|markup=15|note=ملاحظة الزبون هنا' in probe, probe)

# مبلغ ثابت 500₪ ← 58000 + 50000 = 108000
out = as_user(SALES, f"""select api.create_quotation_version(
  '{pid('PN')}'::uuid, 0, '', 'aaaa4444-0000-4000-8000-00000000f002'::uuid, null,
  '{{"mode":"amount","targets":{{"crepe_with_lining":500}}}}'::jsonb)::text;""")
vm2 = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
probe = sql(f"""select 'list=' || list_price_agorot
 from core.quotation_items where version_id = '{vm2}';""", quiet=False)
check('37 زيادة مبلغ 500₪: list_price = 58000 + 50000 = 108000',
      'list=108000' in probe, probe)

# «all» يطال كل تصنيف: 10% ← 63800
out = as_user(SALES, f"""select api.create_quotation_version(
  '{pid('PN')}'::uuid, 0, '', 'aaaa4444-0000-4000-8000-00000000f003'::uuid, null,
  '{{"mode":"percent","targets":{{"all":10}}}}'::jsonb)::text;""")
vm3 = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
probe = sql(f"""select 'list=' || list_price_agorot
 from core.quotation_items where version_id = '{vm3}';""", quiet=False)
check('38 «all» 10% يطال التصنيف: list_price = 63800', 'list=63800' in probe, probe)

# بلا زيادة ← list_price = 0 (لا مرساة)
out = as_user(SALES, f"""select api.create_quotation_version(
  '{pid('PN')}'::uuid, 0, '', 'aaaa4444-0000-4000-8000-00000000f004'::uuid)::text;""")
vm4 = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
probe = sql(f"""select 'list=' || list_price_agorot
 from core.quotation_items where version_id = '{vm4}';""", quiet=False)
check('39 بلا زيادة: list_price = 0', 'list=0' in probe, probe)

# العرض يكشف list_price وmarkup_spec للمبيعات
probe = as_user(SALES, f"""select 'v=' || (select count(*) from api.quotation_items
   where version_id = '{vm}' and list_price_agorot = 66700)
 || '|m=' || (select (markup_spec->'targets'->>'crepe_with_lining')
              from api.quotation_versions where version_id = '{vm}');""")
check('40 العرضان يكشفان list_price وmarkup_spec', 'v=1|m=15' in probe, probe)

# ── التخفيض الذكي الدقيق: مبلغٌ مطلق يقف الإجمالي على الرقم بالضبط ─────────────
# PN بندٌ واحد، subtotal = 58000. خصمٌ مطلق 8000 ← الإيراد قبل מע"מ = 50000
# بالضبط (يقف على 500₪). والمسار المئوي القديم لا يبلغه: 13.79% تعطي
# floor(58000×13.79/100/100)×100 = 7900 لا 8000 - فالمطلق أدقّ بالتصميم.
out = as_user(SALES, f"""select api.create_quotation_version(
  '{pid('PN')}'::uuid, 0, '', 'aaaa4444-0000-4000-8000-00000000f005'::uuid, null,
  '{{}}'::jsonb, 8000)::text;""")
ok = ('"discount_agorot": 8000' in out
      and '"subtotal_agorot": 58000' in out
      and '"total_agorot": 59000' in out)   # rev_ex 50000 + מע"מ 9000
check('41 خصمٌ مطلق 8000: الإيراد يقف على 50000 (المطلق دقيق حيث المئوي 7900)',
      ok, out)

vd = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
probe = sql(f"""select 'pct=' || discount_percent || '|disc=' || discount_agorot
 from core.quotation_versions where id = '{vd}';""", quiet=False)
check('42 النسبة تُشتقّ من المبلغ للصلاحية: 8000/58000 = 13.79٪',
      'pct=13.79|disc=8000' in probe, probe)

# مبلغٌ يفوق المجموع يُقصّ إلى المجموع (least) - لا خصمٌ سالب ولا إيرادٌ سالب
out = as_user(SALES, f"""select api.create_quotation_version(
  '{pid('PN')}'::uuid, 0, '', 'aaaa4444-0000-4000-8000-00000000f006'::uuid, null,
  '{{}}'::jsonb, 99999999)::text;""")
check('43 مبلغٌ يفوق المجموع يُقصّ إلى المجموع (الإجمالي 0 لا سالب)',
      '"discount_agorot": 58000' in out and '"total_agorot": 0' in out, out)

# مبلغٌ سالب مرفوض
out = as_user(SALES, f"""select api.create_quotation_version(
  '{pid('PN')}'::uuid, 0, '', 'aaaa4444-0000-4000-8000-00000000f007'::uuid, null,
  '{{}}'::jsonb, -100)::text;""")
check('44 مبلغ خصمٍ سالب BD400', 'BD400' in out or 'سالبًا' in out, out)

# ── المطلق يعبر مسار الموافقة سالمًا (تصليح التدقيق العدائي على PR-E) ─────────
# خصمٌ مطلق 5000 نسبتُه المشتقّة 8.62٪ (بين حدّ الموظف 5 والأدمن 10 ← يلزم
# موافقة). النسخة تخزّن المبلغ 5000 بالضبط والنسبة المشتقّة؛ لا يُعاد اشتقاق
# المبلغ من نسبةٍ مبتورة كما كان يفعل مسار الطلب القديم.
out = as_user(SALES, f"""select api.create_quotation_version(
  '{pid('PN')}'::uuid, 0, 'خصم يتطلب موافقة', 'aaaa4444-0000-4000-8000-00000000f008'::uuid, null,
  '{{}}'::jsonb, 5000)::text;""")
vabs = grab(r'"version_id"\s*:\s*"([0-9a-f-]+)"', out)
probe = sql(f"""select 'disc=' || discount_agorot || '|pct=' || discount_percent
 from core.quotation_versions where id = '{vabs}';""", quiet=False)
check('45 المطلق في نطاق الموافقة: النسخة تخزّن 5000 والنسبة المشتقّة 8.62',
      'disc=5000|pct=8.62' in probe, probe)

# موافقةٌ ببصمةٍ مطابقة على النسبة المخزّنة، ثم إرسال: المبلغ يبقى 5000 بالضبط.
sql(f"""insert into core.discount_requests
  (organization_id, quotation_id, version_id, requested_percent, reason,
   status, requested_by, decided_by, decided_at, content_fingerprint)
select '{ORG}', v.quotation_id, v.id, v.discount_percent, 'موافقة أدمن',
       'approved', '{SALES}', '{ADMIN}', now(), private.version_content_fingerprint(v.id)
from core.quotation_versions v where v.id = '{vabs}';""")
out = send(SALES, vabs, 'aaaa4444-0000-4000-8000-00000000f009')
probe = sql(f"""select 'disc=' || discount_agorot || '|status=' || status
 from core.quotation_versions where id = '{vabs}';""", quiet=False)
check('46 الإرسال بعد الموافقة يحفظ المطلق دقيقًا (5000، لا يُعاد اشتقاقه)',
      'ERROR' not in out and 'disc=5000|status=sent' in probe, out + probe)


print('\n=== cleanup ===')
sql(PURGE)
print('purged')

print(f'\n===== النتيجة: نجح {len(passed)} / فشل {len(failed)} =====')
if failed:
    for f in failed:
        print('FAILED:', f)
    sys.exit(1)
