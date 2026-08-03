"""اختبار عقود سلامة العلاقات والحالات لطبقة عروض الأسعار (ترحيلا 130001/130002).

يفحص القيود المحركية نفسها لا سلوك RPC (الدوال لم تُبنَ بعد — تنتظر تصديق §10):
الربط الثلاثي نسخة↔عرض، عرض واحد لكل مشروع، بصمة طلب الخصم، قيد شكل دورة
الحياة الكامل، فهارس التفرد الجزئية (مسودة/مرسلة/معتمدة واحدة)، اشتقاق
effective_status، عدادات المستندات، والسطح الكتابي (RPC-only).

ملاحظة مقصودة: اعتماد نسخة منقضية فعليًا مقبول محركيًا هنا — رفضُه بـBD409
عقدُ RPC الاعتماد لا قيدُ الجدول، ويُختبر مع الدوال عند بنائها.
"""
import sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.environ.get('VPS_HELPER_DIR', HERE)
sys.path.insert(0, HELPER)
from vps import run, put_text  # noqa: E402

IID = os.environ.get('BAYTAK_INSTANCE_ID') or open(
    os.path.join(HELPER, 'instance_id.txt')).read().strip()
DB = os.environ.get('BAYTAK_DB_CONTAINER') or f'supabase-db-{IID}'

ORG   = 'aaaa2222-0000-4000-8000-000000000001'
ADMIN = 'aaaa2222-0000-4000-8000-0000000000a1'
CUST  = 'aaaa2222-0000-4000-8000-0000000000c1'
P1    = 'aaaa2222-0000-4000-8000-0000000000d1'
P2    = 'aaaa2222-0000-4000-8000-0000000000d2'
QA    = 'aaaa2222-0000-4000-8000-0000000000f1'
QB    = 'aaaa2222-0000-4000-8000-0000000000f2'
V1    = 'aaaa2222-0000-4000-8000-0000000000e1'
V2    = 'aaaa2222-0000-4000-8000-0000000000e2'
V3    = 'aaaa2222-0000-4000-8000-0000000000e3'
V4    = 'aaaa2222-0000-4000-8000-0000000000e4'
B1    = 'aaaa2222-0000-4000-8000-0000000000e9'
DR1   = 'aaaa2222-0000-4000-8000-0000000000f9'

passed, failed = [], []


def sql(text, quiet=True):
    put_text(text + '\n', '/tmp/qc.sql')
    return run(f'docker exec -i {DB} psql -U postgres {"-q" if quiet else ""} < /tmp/qc.sql 2>&1')


def check(name, ok, detail=''):
    (passed if ok else failed).append(name)
    print(f'{"PASS" if ok else "FAIL"}  {name}')
    if not ok and detail:
        print('      ' + detail.strip().replace('\n', '\n      ')[:600])


PURGE = f"""
set session_replication_role = replica;
delete from core.discount_requests   where organization_id = '{ORG}';
delete from core.quotation_versions  where organization_id = '{ORG}';
delete from core.quotations          where organization_id = '{ORG}';
delete from core.document_sequences  where organization_id = '{ORG}';
delete from core.audit_logs          where organization_id = '{ORG}';
delete from core.projects            where organization_id = '{ORG}';
delete from core.customers           where organization_id = '{ORG}';
delete from core.organization_members where organization_id = '{ORG}';
delete from core.business_settings   where organization_id = '{ORG}';
delete from core.organizations       where id = '{ORG}';
delete from core.profiles            where id = '{ADMIN}';
delete from auth.users               where id = '{ADMIN}';
set session_replication_role = origin;
"""

print('=== seeding ===')
seed_out = sql(PURGE + f"""
insert into core.organizations (id,name) values ('{ORG}','اختبار العروض');
insert into core.business_settings (organization_id) values ('{ORG}');
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,
                        email_confirmed_at,created_at,updated_at)
values ('{ADMIN}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','qc@t.local','x',now(),now(),now());
insert into core.profiles (id,full_name) values ('{ADMIN}','أدمن العروض');
insert into core.organization_members (organization_id,user_id,role)
values ('{ORG}','{ADMIN}','admin');
insert into core.customers (id,organization_id,full_name,phone)
values ('{CUST}','{ORG}','زبون العروض','05');
insert into core.projects (id,organization_id,customer_id,code,status_code)
values ('{P1}','{ORG}','{CUST}','QC-1','quotation'),
       ('{P2}','{ORG}','{CUST}','QC-2','quotation');
insert into core.quotations (id,organization_id,project_id,number)
values ('{QA}','{ORG}','{P1}','QC-Q-1'),
       ('{QB}','{ORG}','{P2}','QC-Q-2');
insert into core.quotation_versions (id,organization_id,quotation_id,version_number,valid_until,created_by)
values ('{V1}','{ORG}','{QA}',1, now() + interval '14 days','{ADMIN}'),
       ('{B1}','{ORG}','{QB}',1, now() + interval '14 days','{ADMIN}');
""")
if 'ERROR' in seed_out:
    print(seed_out)
    sys.exit(1)
print('seeded')

# ── (1) الربط الثلاثي: نسخة العرض الآخر لا تصلح نسخةً حالية ──────────────────
out = sql(f"update core.quotations set current_version_id='{B1}' where id='{QA}';")
check('01 نسخة حالية من عرض آخر مرفوضة (FK ثلاثي)',
      'quotations_current_version_fk' in out, out)

out = sql(f"update core.quotations set current_version_id='{V1}' where id='{QA}';")
check('02 النسخة الحالية الشرعية مقبولة', 'ERROR' not in out, out)

# ── عرض أب واحد لكل مشروع ────────────────────────────────────────────────────
out = sql(f"""insert into core.quotations (organization_id,project_id,number)
values ('{ORG}','{P1}','QC-Q-DUP');""")
check('03 عرض ثانٍ لنفس المشروع مرفوض', 'quotations_one_per_project' in out, out)

# ── مسودة واحدة لكل عرض ─────────────────────────────────────────────────────
out = sql(f"""insert into core.quotation_versions (organization_id,quotation_id,version_number,valid_until,created_by)
values ('{ORG}','{QA}',7, now() + interval '14 days','{ADMIN}');""")
check('04 مسودتان لعرض واحد مرفوضتان', 'quotation_versions_one_draft_idx' in out, out)

# ── طلب الخصم: الربط الثلاثي والبصمة ─────────────────────────────────────────
out = sql(f"""insert into core.discount_requests (organization_id,quotation_id,version_id,requested_percent,reason,requested_by,content_fingerprint)
values ('{ORG}','{QA}','{B1}',7,'سبب','{ADMIN}','fp-x');""")
check('05 طلب خصم بنسخة من عرض آخر مرفوض',
      'discount_requests_version_belongs_to_quotation_fk' in out, out)

out = sql(f"""insert into core.discount_requests (organization_id,quotation_id,version_id,requested_percent,reason,requested_by)
values ('{ORG}','{QA}','{V1}',7,'سبب','{ADMIN}');""")
check('06 طلب خصم بلا بصمة محتوى مرفوض', 'content_fingerprint' in out and 'ERROR' in out, out)

out = sql(f"""insert into core.discount_requests (id,organization_id,quotation_id,version_id,requested_percent,reason,requested_by,content_fingerprint)
values ('{DR1}','{ORG}','{QA}','{V1}',7,'زبون قديم','{ADMIN}',md5('demo'));""")
check('07 طلب الخصم الشرعي مقبول', 'ERROR' not in out, out)

# ── قيد شكل دورة الحياة ──────────────────────────────────────────────────────
out = sql(f"update core.quotation_versions set locked=true where id='{V1}';")
check('08 مسودة مقفلة مرفوضة (شكل)', 'version_lifecycle_shape' in out, out)

out = sql(f"""update core.quotation_versions
set status='sent', sent_at=now(), locked=true where id='{V1}';""")
check('09 إرسال بلا sent_by مرفوض (شكل)', 'version_lifecycle_shape' in out, out)

out = sql(f"""update core.quotation_versions
set status='sent', sent_at=now(), sent_by='{ADMIN}', locked=true where id='{V1}';""")
check('10 الإرسال بالشكل الكامل مقبول', 'ERROR' not in out, out)

# ── مرسلة واحدة لكل عرض ─────────────────────────────────────────────────────
out = sql(f"""insert into core.quotation_versions (id,organization_id,quotation_id,version_number,valid_until,created_by,status,sent_at,sent_by,locked)
values ('{V2}','{ORG}','{QA}',2, now() + interval '14 days','{ADMIN}','sent',now(),'{ADMIN}',true);""")
check('11 نسختان مرسلتان لعرض واحد مرفوضتان', 'quotation_versions_one_sent_idx' in out, out)

out = sql(f"""update core.quotation_versions
set status='rejected', rejected_at=now(), decision_recorded_by='{ADMIN}' where id='{V1}';""")
check('12 رفض بلا ملاحظة قرار مرفوض (شكل)', 'version_lifecycle_shape' in out, out)

out = sql(f"""update core.quotation_versions
set status='rejected', rejected_at=now(), decision_recorded_by='{ADMIN}',
    decision_note='السعر مرتفع' where id='{V1}';""")
check('13 الرفض الموثق كاملًا مقبول', 'ERROR' not in out, out)

# ── الانقضاء المشتق: المخزن sent والفعلي expired ─────────────────────────────
out = sql(f"""insert into core.quotation_versions (id,organization_id,quotation_id,version_number,valid_until,created_by)
values ('{V3}','{ORG}','{QA}',2, now() - interval '1 day','{ADMIN}');
update core.quotation_versions
set status='sent', sent_at=now(), sent_by='{ADMIN}', locked=true where id='{V3}';""")
probe = sql(f"""select status || '|' || effective_status || '|' || is_expired
from api.quotation_versions where version_id='{V3}';""", quiet=False)
check('14 المخزن sent والفعلي expired (مصدر حقيقة واحد)',
      'sent|expired|t' in probe, probe)

out = sql(f"""update core.quotation_versions
set status='approved', approved_at=now(), decision_recorded_by='{ADMIN}' where id='{V3}';""")
check('15 الاعتماد بالشكل الكامل مقبول محركيًا', 'ERROR' not in out, out)

# ── معتمدة واحدة لكل عرض ────────────────────────────────────────────────────
out = sql(f"""insert into core.quotation_versions (id,organization_id,quotation_id,version_number,valid_until,created_by,status,sent_at,sent_by,locked)
values ('{V4}','{ORG}','{QA}',3, now() + interval '14 days','{ADMIN}','sent',now(),'{ADMIN}',true);
update core.quotation_versions
set status='approved', approved_at=now(), decision_recorded_by='{ADMIN}' where id='{V4}';""")
check('16 اعتماد نسخة ثانية لنفس العرض مرفوض',
      'quotation_versions_one_approved_idx' in out, out)

# ── superseded ───────────────────────────────────────────────────────────────
out = sql(f"""update core.quotation_versions set status='superseded' where id='{V4}';""")
check('17 استبدال بلا superseded_at مرفوض (شكل)', 'version_lifecycle_shape' in out, out)

out = sql(f"""update core.quotation_versions
set status='superseded', superseded_at=now() where id='{V4}';""")
check('18 الاستبدال الموقوت مقبول', 'ERROR' not in out, out)

# ── عدادات المستندات ─────────────────────────────────────────────────────────
out = sql(f"""insert into core.document_sequences (organization_id,doc_type,year,last_number)
values ('{ORG}','quotation',2026,0);
insert into core.document_sequences (organization_id,doc_type,year,last_number)
values ('{ORG}','quotation',2026,5);""")
check('19 عداد واحد لكل (مؤسسة،نوع،سنة)', 'document_sequences_pkey' in out, out)

out = sql(f"""update core.document_sequences set last_number=-1
where organization_id='{ORG}' and doc_type='quotation' and year=2026;""")
check('20 عداد سالب مرفوض', 'document_sequences_last_number_check' in out, out)

probe = sql(f"""select timezone from core.business_settings where organization_id='{ORG}';""", quiet=False)
check('21 المنطقة الزمنية الافتراضية Asia/Jerusalem', 'Asia/Jerusalem' in probe, probe)

# ── السطح الكتابي: جداول العروض والعدادات RPC-only ───────────────────────────
probe = sql("""select 'WRITE_PRIVS=' || count(*) from information_schema.table_privileges
where table_schema='core'
  and table_name in ('quotations','quotation_versions','quotation_items',
                     'discount_requests','document_sequences')
  and grantee='authenticated'
  and privilege_type in ('INSERT','UPDATE','DELETE');""", quiet=False)
check('22 لا منح كتابة مباشرة لـauthenticated على طبقة العروض',
      'WRITE_PRIVS=0' in probe, probe)

print('\n=== cleanup ===')
sql(PURGE)
print('purged')

print(f'\n===== النتيجة: نجح {len(passed)} / فشل {len(failed)} =====')
if failed:
    for f in failed:
        print('FAILED:', f)
    sys.exit(1)
