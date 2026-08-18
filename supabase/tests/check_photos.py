"""صور الشيكات: كلٌّ على شيكها، ولمن يرى المال وحده.

قرار المالك (18.8.2026): الشيك المؤجَّل مالٌ محصَّل يوم تسلّمه، وصورته توثيقٌ
اختياري - واحدةٌ أو أكثر لكل شيك، بالكاميرا أو من المعرض.

وصورة الشيك ليست كصورة الغرفة: فيها حساب الزبون البنكي وتوقيعه. المشروع يراه
الخياط والميداني، والمال لا يرونه - فهذه المجموعة تثبت أن الصورة تتبع سياسة
المال لا سياسة المشروع، وأنها لا تُعلَّق على دفعةِ مشروعٍ آخر فتصير بابًا
خلفيًا لقراءةِ ما لا يُرى.
"""
import sys, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.environ.get('VPS_HELPER_DIR', HERE)
sys.path.insert(0, HELPER)
from vps import run, put_text  # noqa: E402

IID = os.environ.get('BAYTAK_INSTANCE_ID') or open(
    os.path.join(HELPER, 'instance_id.txt')).read().strip()
DB = os.environ.get('BAYTAK_DB_CONTAINER') or f'supabase-db-{IID}'

ORG = 'eeee9999-0000-4000-8000-000000000001'
ADMIN = 'eeee9999-0000-4000-8000-0000000000a1'
SALES = 'eeee9999-0000-4000-8000-0000000000a2'
T1 = 'eeee9999-0000-4000-8000-0000000000a3'

UUID_RE = r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'


def key(n):
    return f'eeee9999-0000-4000-8000-00000000ee{n:02d}'


passed, failed = [], []


def sql(text, quiet=True):
    put_text(text + '\n', '/tmp/checkphotos.sql')
    return run(f'docker exec -i {DB} psql -U postgres {"-q" if quiet else ""} < /tmp/checkphotos.sql 2>&1')


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
delete from core.attachments          where organization_id = '{ORG}';
delete from core.client_operations    where organization_id = '{ORG}';
delete from core.audit_logs           where organization_id = '{ORG}';
delete from core.notifications        where organization_id = '{ORG}';
delete from core.payments             where organization_id = '{ORG}';
delete from core.quotation_versions   where organization_id = '{ORG}';
delete from core.quotations           where organization_id = '{ORG}';
delete from core.document_sequences   where organization_id = '{ORG}';
delete from core.projects             where organization_id = '{ORG}';
delete from core.customers            where organization_id = '{ORG}';
delete from core.organization_members where organization_id = '{ORG}';
delete from core.business_settings    where organization_id = '{ORG}';
delete from core.organizations        where id = '{ORG}';
delete from core.profiles             where id in ('{ADMIN}','{SALES}','{T1}');
delete from auth.users                where id in ('{ADMIN}','{SALES}','{T1}');
set session_replication_role = origin;
"""

print('=== seeding ===')
users = ",\n ".join(
    f"('{u}','00000000-0000-0000-0000-000000000000','authenticated','authenticated',"
    f"'chk{i}@t.local','x',now(),now(),now())"
    for i, u in enumerate([ADMIN, SALES, T1]))
out = sql(PURGE + f"""
insert into core.organizations (id,name) values ('{ORG}','معرض الشيكات');
insert into core.business_settings (organization_id) values ('{ORG}');
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,
                        email_confirmed_at,created_at,updated_at) values
 {users};
insert into core.profiles (id,full_name) values
 ('{ADMIN}','أدمن الشيكات'), ('{SALES}','بائع الشيكات'), ('{T1}','خياط الشيكات');
insert into core.organization_members (organization_id,user_id,role,is_active) values
 ('{ORG}','{ADMIN}','admin',true), ('{ORG}','{SALES}','sales',true),
 ('{ORG}','{T1}','tailor',true);
""")
if 'ERROR' in out:
    print(out); sys.exit(1)

out = as_user(SALES, f"""select api.save_customer(
  'زبون الشيكات', '052-6444414', '{key(1)}'::uuid)::text;""")
CUST = grab(r'"customer_id"\s*:\s*"([0-9a-f-]+)"', out)
out = as_user(SALES, f"""select api.create_project(
  '{CUST}'::uuid, 'بيت الشيكات', '{T1}'::uuid, null, '{key(2)}'::uuid)::text;""")
PRJ = grab(r'"project_id"\s*:\s*"([0-9a-f-]+)"', out)
if not (CUST and PRJ):
    print(out); sys.exit(1)

out = sql(f"""
insert into core.quotations (id,organization_id,project_id,number,status)
values ('{key(90)}','{ORG}','{PRJ}','QT-CHK-1','approved');
insert into core.quotation_versions
  (id,organization_id,quotation_id,version_number,status,locked,
   subtotal_agorot,discount_agorot,vat_agorot,total_agorot,pricing_context,
   created_by,sent_at,sent_by,decision_recorded_by,approved_at,valid_until)
values ('{key(91)}','{ORG}','{key(90)}',1,'approved',true,
        1200000,0,0,1200000,'{{}}'::jsonb,'{ADMIN}',now(),'{ADMIN}','{ADMIN}',
        now(),now() + interval '30 days');
update core.quotations set current_version_id = '{key(91)}' where id = '{key(90)}';
insert into core.projects (organization_id,customer_id,code,title,status_code)
values ('{ORG}','{CUST}','BD-OTHER-CHK','بيتٌ آخر','measured');
""")
if 'ERROR' in out:
    print(out); sys.exit(1)
print('seeded')

SERIES = ('[{"amount_agorot":200000,"due_at":"2026-09-15T09:00:00Z"},'
          ' {"amount_agorot":200000,"due_at":"2026-10-15T09:00:00Z"}]')

# ── ١) الرزمة تُسجَّل وتعيد معرّفاتها بترتيبها ──────────────────────────────
out = as_user(SALES, f"""select api.record_check_series('{PRJ}'::uuid,
  '{SERIES}'::jsonb, '{key(3)}'::uuid, 'رزمة التوقيع')::text;""")
IDS = re.findall(UUID_RE, out)
check('01 الرزمة تُسجَّل وتعيد معرّف كل شيك',
      'ERROR' not in out and '"count": 2' in out and len(IDS) == 2, out)

probe = sql(f"""select 'refs=' || string_agg(reference, ',' order by reference)
 from core.payments where project_id = '{PRJ}';""", quiet=False)
check('02 المراجع CHK 1/2 و2/2', 'refs=CHK 1/2,CHK 2/2' in probe, probe)

CHK1 = IDS[0] if IDS else '00000000-0000-0000-0000-000000000000'
CHK2 = IDS[1] if len(IDS) > 1 else CHK1

probe = sql(f"""select 'due=' || to_char(due_at, 'YYYY-MM')
 from core.payments where id = '{CHK1}';""", quiet=False)
check('03 موعد التسديد محفوظ على الشيك نفسه', 'due=2026-09' in probe, probe)

# ── ٢) الصورة تُعلَّق على شيكها ────────────────────────────────────────────
out = as_user(SALES, f"""insert into api.attachments
  (attachment_id, organization_id, project_id, payment_id, kind, storage_path,
   caption, byte_size, created_by)
 values ('{key(10)}','{ORG}','{PRJ}','{CHK1}','check','{ORG}/{PRJ}/a1.webp',
         'صورة الشيك 1', 4096, '{SALES}');""")
check('04 البائع يعلّق صورةً على شيكها', 'ERROR' not in out, out)

out = as_user(SALES, f"""insert into api.attachments
  (attachment_id, organization_id, project_id, payment_id, kind, storage_path,
   caption, byte_size, created_by)
 values ('{key(14)}','{ORG}','{PRJ}','{CHK1}','check','{ORG}/{PRJ}/a5.webp',
         'صورة ثانية للشيك 1', 4096, '{SALES}');""")
probe = sql(f"""select 'n=' || count(*) from core.attachments where payment_id = '{CHK1}';""",
            quiet=False)
check('05 وأكثر من صورةٍ للشيك الواحد', 'ERROR' not in out and 'n=2' in probe, out + probe)

# ── ٣) الباب الخلفي: صورة على دفعةِ مشروعٍ آخر ────────────────────────────
OTHER = grab(UUID_RE, sql("""select id from core.projects where code = 'BD-OTHER-CHK';""",
                          quiet=False))
out = as_user(SALES, f"""insert into api.attachments
  (attachment_id, organization_id, project_id, payment_id, kind, storage_path,
   caption, byte_size, created_by)
 values ('{key(11)}','{ORG}','{OTHER}','{CHK1}','check','{ORG}/{OTHER}/a2.webp',
         'صورة في غير مكانها', 4096, '{SALES}');""")
check('06 صورةٌ على دفعةِ مشروعٍ آخر → مرفوضة',
      'ERROR' in out and 'المشروع نفسه' in out, out)

# ── ٤) من يرى الصورة ومن لا يراها ────────────────────────────────────────
probe = as_user(ADMIN, f"""select 'n=' || count(*) from api.attachments
 where payment_id = '{CHK1}';""")
check('07 الأدمن يرى صور الشيك', 'n=2' in probe, probe)

probe = as_user(T1, f"""select 'n=' || count(*) from api.attachments
 where payment_id = '{CHK1}';""")
check('08 الخياط يرى المشروع ولا يرى صورة شيكه', 'n=0' in probe, probe)

out = as_user(T1, f"""insert into api.attachments
  (attachment_id, organization_id, project_id, payment_id, kind, storage_path,
   caption, byte_size, created_by)
 values ('{key(12)}','{ORG}','{PRJ}','{CHK2}','check','{ORG}/{PRJ}/a3.webp',
         'صورة الخياط', 4096, '{T1}');""")
check('09 الخياط لا يرفع صورة شيك', 'ERROR' in out, out)

out = as_user(T1, f"""insert into api.attachments
  (attachment_id, organization_id, project_id, kind, storage_path,
   caption, byte_size, created_by)
 values ('{key(13)}','{ORG}','{PRJ}','measurement','{ORG}/{PRJ}/a4.webp',
         'صورة قياس', 4096, '{T1}');""")
probe = as_user(T1, f"""select 'm=' || count(*) from api.attachments
 where project_id = '{PRJ}' and kind = 'measurement';""")
check('10 وصور العمل على حالها: الخياط يرفعها ويراها',
      'ERROR' not in out and 'm=1' in probe, out + probe)

# ── ٥) الإعادة بنفس المفتاح ──────────────────────────────────────────────
out = as_user(SALES, f"""select api.record_check_series('{PRJ}'::uuid,
  '{SERIES}'::jsonb, '{key(3)}'::uuid, 'رزمة التوقيع')::text;""")
probe = sql(f"""select count(*) from core.payments where project_id = '{PRJ}';""", quiet=False)
check('11 إعادة المفتاح: was_replayed، والمعرّفات نفسها، ولا شيك ثالث',
      '"was_replayed": true' in out and CHK1 in out
      and re.search(r'^\s*2\s*$', probe, re.M) is not None, out + probe)

print('\n=== cleanup ===')
sql(PURGE)
print('purged')

print(f'\n===== النتيجة: نجح {len(passed)} / فشل {len(failed)} =====')
if failed:
    for f in failed:
        print('FAILED:', f)
    sys.exit(1)
