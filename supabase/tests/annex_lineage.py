"""الملحق: بابه الشرعي، وأبوابه الخلفية، ورصيده الواحد.

الملحق مستندٌ مستقل معلَّق على أصله - له شبابيكه وعرضه وأمر إنتاجه، وليس له
دفترُ دفعات. وذاك ليس عُرفًا في الشاشة بل قيدٌ في القاعدة: هذه المجموعة تثبته.

وتثبت ما هو أخفى: أن نسب الملحق لا يُكتب إلا من بابه. فـapi.projects عرضٌ
قابل للإدخال والتحديث ممنوحٌ لـauthenticated، ولولا حارسٌ لأمكن بضربة PATCH
واحدة أن يُعلَّق مشروعٌ مدفوعٌ على آخر: ينتقل دفتر دفعاته إلى جذرٍ غريب،
وتتبدّل صلاحية رؤيته، ويصير الرصيد الذي يراه الزبون رصيدَ عائلةٍ لم يتفق
عليها. ويثبت أخيرًا أن الحارس لم يخنق العمل العادي: مشروعٌ يُنشأ ويُعدَّل كما
كان قبله.
"""
import sys, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.environ.get('VPS_HELPER_DIR', HERE)
sys.path.insert(0, HELPER)
from vps import run, put_text  # noqa: E402

IID = os.environ.get('BAYTAK_INSTANCE_ID') or open(
    os.path.join(HELPER, 'instance_id.txt')).read().strip()
DB = os.environ.get('BAYTAK_DB_CONTAINER') or f'supabase-db-{IID}'

ORG   = 'dddd8888-0000-4000-8000-000000000001'
ADMIN = 'dddd8888-0000-4000-8000-0000000000a1'
SALES = 'dddd8888-0000-4000-8000-0000000000a2'
F1    = 'dddd8888-0000-4000-8000-0000000000a3'
T1    = 'dddd8888-0000-4000-8000-0000000000a4'
PROD  = 'dddd8888-0000-4000-8000-0000000000e1'
VAR   = 'dddd8888-0000-4000-8000-0000000000e2'


def key(n): return f'dddd8888-0000-4000-8000-00000000ee{n:02d}'


passed, failed = [], []


def sql(text, quiet=True):
    put_text(text + '\n', '/tmp/annex.sql')
    return run(f'docker exec -i {DB} psql -U postgres {"-q" if quiet else ""} < /tmp/annex.sql 2>&1')


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
delete from core.payments            where organization_id = '{ORG}';
delete from core.field_visits        where organization_id = '{ORG}';
delete from core.windows             where organization_id = '{ORG}';
delete from core.rooms               where organization_id = '{ORG}';
delete from core.quotation_versions  where organization_id = '{ORG}';
delete from core.quotations          where organization_id = '{ORG}';
delete from core.fabric_variants     where organization_id = '{ORG}';
delete from core.fabric_products     where organization_id = '{ORG}';
delete from core.document_sequences  where organization_id = '{ORG}';
update core.projects set parent_project_id = null where organization_id = '{ORG}';
delete from core.projects            where organization_id = '{ORG}';
delete from core.customers           where organization_id = '{ORG}';
delete from core.organization_members where organization_id = '{ORG}';
delete from core.pricing_rules       where organization_id = '{ORG}';
delete from core.business_settings   where organization_id = '{ORG}';
delete from core.organizations       where id = '{ORG}';
delete from core.profiles            where id in ('{ADMIN}','{SALES}','{F1}','{T1}');
delete from auth.users               where id in ('{ADMIN}','{SALES}','{F1}','{T1}');
set session_replication_role = origin;
"""

print('=== seeding ===')
users = ",\n ".join(
    f"('{u}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','annex{i}@t.local','x',now(),now(),now())"
    for i, u in enumerate([ADMIN, SALES, F1, T1]))
out = sql(PURGE + f"""
insert into core.organizations (id,name) values ('{ORG}','معرض الملاحق');
insert into core.business_settings (organization_id) values ('{ORG}');
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,
                        email_confirmed_at,created_at,updated_at) values
 {users};
insert into core.profiles (id,full_name) values
 ('{ADMIN}','أدمن الملاحق'), ('{SALES}','بائع الملاحق'),
 ('{F1}','قائس الملاحق'), ('{T1}','خياط الملاحق');
insert into core.organization_members (organization_id,user_id,role,is_active) values
 ('{ORG}','{ADMIN}','admin',true), ('{ORG}','{SALES}','sales',true),
 ('{ORG}','{F1}','field',true), ('{ORG}','{T1}','tailor',true);
insert into core.fabric_products (id,organization_id,name,kind,width_cm)
values ('{PROD}','{ORG}','قماش الملاحق','other',280);
insert into core.fabric_variants (id,organization_id,product_id,color_name,sku,cost_per_meter_agorot)
values ('{VAR}','{ORG}','{PROD}','رملي','AN-F',2000);
""")
if 'ERROR' in out:
    print(out); sys.exit(1)

# الأصل: مشروعٌ بعرضٍ معتمدٍ 8,400 ₪ - الملحق لا يُفتح على مشروعٍ لم يُتفق عليه
out = as_user(SALES, f"""select api.save_customer(
  'زبون الملاحق', '052-6444414', '{key(1)}'::uuid)::text;""")
CUST = grab(r'"customer_id"\s*:\s*"([0-9a-f-]+)"', out)
out = as_user(SALES, f"""select api.create_project(
  '{CUST}'::uuid, 'بيت الملاحق', '{T1}'::uuid, '{F1}'::uuid, '{key(2)}'::uuid)::text;""")
PRJ = grab(r'"project_id"\s*:\s*"([0-9a-f-]+)"', out)
if not (CUST and PRJ):
    print(out); sys.exit(1)

out = sql(f"""
select set_config('app.rpc_context','on',false) \g /dev/null
update core.projects set status_code = 'measured' where id = '{PRJ}';
select set_config('app.rpc_context','',false) \g /dev/null
insert into core.rooms (organization_id,project_id,name) values ('{ORG}','{PRJ}','صالون');
insert into core.quotations (id,organization_id,project_id,number,status)
values ('{key(90)}','{ORG}','{PRJ}','QT-AN-1','approved');
insert into core.quotation_versions
  (id,organization_id,quotation_id,version_number,status,locked,
   subtotal_agorot,discount_agorot,vat_agorot,total_agorot,pricing_context,
   created_by,sent_at,sent_by,decision_recorded_by,approved_at,valid_until)
values ('{key(91)}','{ORG}','{key(90)}',1,'approved',true,
        840000,0,0,840000,'{{}}'::jsonb,'{ADMIN}',now(),'{ADMIN}','{ADMIN}',
        now(),now() + interval '30 days');
update core.quotations set current_version_id = '{key(91)}' where id = '{key(90)}';
""")
if 'ERROR' in out:
    print(out); sys.exit(1)
print('seeded')

# ── ١) الباب الشرعي ─────────────────────────────────────────────────────────
out = as_user(ADMIN, f"""select api.create_project_annex(
  '{PRJ}'::uuid, 'الزبون أضاف شباكي المطبخ', '{key(3)}'::uuid)::text;""")
ANX = grab(r'"annex_project_id"\s*:\s*"([0-9a-f-]+)"', out)
check('01 الملحق يُفتح من بابه: كود الأصل ثم /1',
      ANX is not None and '"annex_seq": 1' in out and '/1"' in out, out)

probe = sql(f"""select 'rooms=' || (select count(*) from core.rooms where project_id = '{ANX}')
 || '|root=' || (select (root_project_id = '{PRJ}')::text from core.projects where id = '{ANX}')
 || '|team=' || (select (tailor_id = '{T1}' and measurement_worker_id = '{F1}')::text
                 from core.projects where id = '{ANX}');""", quiet=False)
check('02 غرف الأصل تُنسخ، والجذر محسوب، والطاقم موروث',
      'rooms=1|root=true|team=true' in probe, probe)

out = as_user(ADMIN, f"""select api.create_project_annex(
  '{PRJ}'::uuid, 'الزبون أضاف شباكي المطبخ', '{key(3)}'::uuid)::text;""")
probe = sql(f"""select count(*) from core.projects
 where parent_project_id = '{PRJ}';""", quiet=False)
check('03 إعادة المفتاح: was_replayed ولا ملحق ثانٍ',
      '"was_replayed": true' in out and re.search(r'^\s*1\s*$', probe, re.M), out + probe)

out = as_user(ADMIN, f"""select api.create_project_annex(
  '{PRJ}'::uuid, 'ملحق ثانٍ', '{key(4)}'::uuid)::text;""")
check('04 ملحقٌ ثانٍ والأول مفتوح → مرفوض',
      'ERROR' in out and ('مفتوح' in out or 'BD409' in out), out)

out = as_user(ADMIN, f"""select api.create_project_annex(
  '{ANX}'::uuid, 'ملحق على ملحق', '{key(5)}'::uuid)::text;""")
check('05 ملحقٌ على ملحق → مرفوض بحارس العمق',
      'ERROR' in out and 'ملحق آخر' in out, out)

# ── ٢) الأبواب الخلفية: العرض العام لا يكتب نسبًا ────────────────────────────
out = as_user(ADMIN, f"""insert into api.projects
  (organization_id, customer_id, code, title, status_code, parent_project_id, annex_seq)
 values ('{ORG}','{CUST}','BD-BYPASS','ملحق مزروع','measured','{PRJ}',7);""")
check('06 إدخال ملحقٍ من api.projects → مرفوض (بابه RPC حصرًا)',
      'ERROR' in out and 'create_project_annex' in out, out)

out = sql(f"""insert into core.projects (organization_id,customer_id,code,title,status_code)
 values ('{ORG}','{CUST}','BD-OTHER','بيتٌ آخر','measured') returning id;""", quiet=False)
OTHER = grab(r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', out)
out = as_user(ADMIN, f"""update api.projects set parent_project_id = '{OTHER}'
 where project_id = '{ANX}';""")
probe = sql(f"""select (parent_project_id = '{PRJ}')::text from core.projects where id = '{ANX}';""",
            quiet=False)
check('07 نقل نسب الملحق بضربة تحديث → مرفوض والأصل لم يتغيّر',
      'ERROR' in out and 'نسب الملحق' in out and 'true' in probe, out + probe)

out = as_user(ADMIN, f"""update api.projects set parent_project_id = '{PRJ}', annex_seq = 1
 where project_id = '{OTHER}';""")
check('08 تحويل مشروعٍ قائم إلى ملحق → مرفوض',
      'ERROR' in out and 'نسب الملحق' in out, out)

# ── ٣) الحارس لم يخنق العمل العادي ──────────────────────────────────────────
out = as_user(SALES, f"""update api.projects set title = 'بيت الملاحق - محدَّث'
 where project_id = '{PRJ}';""")
probe = sql(f"""select title from core.projects where id = '{PRJ}';""", quiet=False)
check('09 تعديل مشروعٍ عادي يعمل كما كان',
      'ERROR' not in out and 'محدَّث' in probe, out + probe)

out = as_user(SALES, f"""select api.create_project(
  '{CUST}'::uuid, 'مشروع عادي جديد', '{T1}'::uuid, '{F1}'::uuid, '{key(6)}'::uuid)::text;""")
check('10 إنشاء مشروعٍ عادي يعمل كما كان',
      'ERROR' not in out and '"project_id"' in out, out)

# ── ٤) الشباك يُضاف إلى الملحق ما دام لم يُعتمد ─────────────────────────────
ANXROOM = grab(r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
               sql(f"""select id from core.rooms where project_id = '{ANX}' limit 1;""", quiet=False))
out = as_user(F1, f"""select api.save_window(
  '{ANX}'::uuid, '{ANXROOM}'::uuid, 200, 250, '{VAR}'::uuid, '{key(10)}'::uuid)::text;""")
check('11 الشباك يُضاف إلى الملحق قبل اعتماده - وهذا كلُّ سببه',
      'ERROR' not in out and '"window_id"' in out, out)

ROOM = grab(r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
            sql(f"""select id from core.rooms where project_id = '{PRJ}' limit 1;""", quiet=False))
out = as_user(F1, f"""select api.save_window(
  '{PRJ}'::uuid, '{ROOM}'::uuid, 200, 250, '{VAR}'::uuid, '{key(9)}'::uuid)::text;""")
check('12 شباك جديد على الأصل المعتمَد → مرفوض، والملحق هو الطريق',
      'ERROR' in out and 'معتمد' in out, out)

# ── ٥) الأرقام الثلاثة قبل الاعتماد: مسوَّدة الملحق ليست دَينًا ──────────────
probe = as_user(ADMIN, f"""select 'A=' || original_agorot || '|X=' || annex_agorot
 || '|T=' || total_agorot || '|P=' || paid_agorot || '|D=' || due_agorot
 || '|N=' || annex_count
 from api.project_family_finance where project_id = '{PRJ}';""")
check('13 قبل اعتماد الملحق: 8,400 دَينًا ومسوَّدته صفر',
      'A=840000|X=0|T=840000|P=0|D=840000|N=1' in probe, probe)

# ── ٦) يُعتمد عرض الملحق بـ1,900 - وهنا يبدأ المال ─────────────────────────
out = sql(f"""
insert into core.quotations (id,organization_id,project_id,number,status)
values ('{key(92)}','{ORG}','{ANX}','QT-AN-2','approved');
insert into core.quotation_versions
  (id,organization_id,quotation_id,version_number,status,locked,
   subtotal_agorot,discount_agorot,vat_agorot,total_agorot,pricing_context,
   created_by,sent_at,sent_by,decision_recorded_by,approved_at,valid_until)
values ('{key(93)}','{ORG}','{key(92)}',1,'approved',true,
        190000,0,0,190000,'{{}}'::jsonb,'{ADMIN}',now(),'{ADMIN}','{ADMIN}',
        now(),now() + interval '30 days');
update core.quotations set current_version_id = '{key(93)}' where id = '{key(92)}';
""")
if 'ERROR' in out:
    print(out); sys.exit(1)

out = as_user(ADMIN, f"""select api.record_payment(
  '{ANX}'::uuid, 100000, 'deposit', 'cash', '{key(7)}'::uuid)::text;""")
check('14 دفعة على الملحق المعتمد → مرفوضة بحارس الدفتر لا بحارس الاعتماد',
      'ERROR' in out and 'الرصيد واحد' in out, out)

out = as_user(ADMIN, f"""select api.record_payment(
  '{PRJ}'::uuid, 500000, 'deposit', 'cash', '{key(8)}'::uuid)::text;""")
check('15 دفعة على الأصل → مقبولة', 'ERROR' not in out and '"payment_id"' in out, out)

probe = as_user(ADMIN, f"""select 'A=' || original_agorot || '|X=' || annex_agorot
 || '|T=' || total_agorot || '|P=' || paid_agorot || '|D=' || due_agorot
 from api.project_family_finance where project_id = '{PRJ}';""")
check('16 بعد الاعتماد والدفعة: 8,400 + 1,900 − 5,000 = 5,300',
      'A=840000|X=190000|T=1030000|P=500000|D=530000' in probe, probe)

probe = as_user(ADMIN, f"""select count(*) from api.project_family_finance
 where project_id = '{ANX}';""")
check('17 العرض على الجذور وحدها: لا صفَّ عائلةٍ للملحق',
      re.search(r'^\s*0\s*$', probe, re.M) is not None, probe)

out = as_user(F1, f"""select api.save_window(
  '{ANX}'::uuid, '{ANXROOM}'::uuid, 150, 200, '{VAR}'::uuid, '{key(13)}'::uuid)::text;""")
check('18 وبعد اعتماد الملحق يُختم هو أيضًا: لا شباك يُضاف إليه',
      'ERROR' in out and 'معتمد' in out, out)

# ── ٧) الرؤية عائلية: من رأى الأصل رأى ملحقه ────────────────────────────────
probe = as_user(T1, f"""select 'anx=' || count(*) from api.projects where project_id = '{ANX}';""")
check('19 خياط الأصل يرى ملحقه (الرؤية على العائلة)', 'anx=1' in probe, probe)

probe = as_user(F1, f"""select 'anx=' || count(*) from api.projects where project_id = '{ANX}';""")
check('20 قائس الأصل يرى ملحقه', 'anx=1' in probe, probe)

# ── ٨) رحلة تركيبٍ واحدة للبيت ──────────────────────────────────────────────
out = sql(f"""
select set_config('app.rpc_context','on',false) \g /dev/null
update core.projects set status_code = 'ready_for_install'
 where id in ('{PRJ}','{ANX}');
select set_config('app.rpc_context','',false) \g /dev/null""")
out = as_user(ADMIN, f"""select api.schedule_visit(
  '{ANX}'::uuid, '{F1}'::uuid, 'installation', now() + interval '2 days',
  '{key(11)}'::uuid)::text;""")
check('21 تركيب الملحق قبل أصله → مرفوض (يُركَّبان في سفرةٍ واحدة)',
      'ERROR' in out and 'السفرة نفسها' in out, out)

out = as_user(ADMIN, f"""select api.schedule_visit(
  '{PRJ}'::uuid, '{F1}'::uuid, 'installation', now() + interval '2 days',
  '{key(12)}'::uuid)::text;""")
check('22 تركيب الأصل يُجدول عاديًا', 'ERROR' not in out and '"visit_id"' in out, out)
VISIT = grab(r'"visit_id"\s*:\s*"([0-9a-f-]+)"', out)

# السفرة تُمشى إلى آخرها: تبدأ، تُملأ قائمة التحقق، ويوقّع الزبون، ثم تُنهى
out = as_user(F1, f"""select api.start_visit('{VISIT}'::uuid, '{key(14)}'::uuid)::text;""")
ok_start = 'ERROR' not in out
out = as_user(F1, f"""select api.update_visit('{VISIT}'::uuid, '{key(15)}'::uuid,
  null, null, true, true, true, true, true)::text;""")
ok_upd = 'ERROR' not in out
out = as_user(F1, f"""select api.complete_visit('{VISIT}'::uuid, '{key(16)}'::uuid)::text;""")
check('23 إنهاء تركيب الأصل يمرّ (بدء + قائمة تحقق + توقيع)',
      ok_start and ok_upd and 'ERROR' not in out, out)

probe = sql(f"""select 'root=' || (select status_code from core.projects where id = '{PRJ}')
 || '|anx=' || (select status_code from core.projects where id = '{ANX}');""", quiet=False)
check('24 السفرة الواحدة تُنهي البيت: الأصل وملحقه رُكِّبا معًا',
      'root=installed|anx=installed' in probe, probe)

# ── ٩) ذيل التدقيق: بوابة الدور، الأرشفة، الأثر، نوع الإشعار ───────────────
probe = as_user(T1, f"""select count(*) as n from api.project_family_finance
 where project_id = '{PRJ}';""")
check('25 الخياط لا يقرأ العرض المالي: لا صفَّ لا أصفار',
      re.search(r'^\s*0\s*$', probe, re.M) is not None, probe)

probe = as_user(SALES, f"""select 'T=' || total_agorot from api.project_family_finance
 where project_id = '{PRJ}';""")
check('26 والمبيعات تقرؤه كالإدارة', 'T=1030000' in probe, probe)

probe = sql(f"""select 'audit=' || count(*) from core.audit_logs
 where action = 'project.installed_with_parent' and entity_id = '{ANX}';""", quiet=False)
check('27 رفعُ الملحق مع أصله ترك أثره في السجل', 'audit=1' in probe, probe)

probe = sql(f"""select 'kind=' || kind::text from core.notifications
 where organization_id = '{ORG}' and title = 'ملحق جديد' limit 1;""", quiet=False)
check('28 إشعار الملحق بنوعه لا تحت «طلب خصم»', 'kind=project_annex' in probe, probe)

# الأصل المؤرشف يطوي عائلته: لا عائلةَ شبحٍ دَينُها دَين الملحق
out = sql(f"""update core.projects set archived_at = now() where id = '{PRJ}';""")
probe = as_user(ADMIN, f"""select count(*) as n from api.project_family_finance
 where project_id = '{PRJ}';""")
ok_archived = re.search(r'^\s*0\s*$', probe, re.M) is not None
sql(f"""update core.projects set archived_at = null where id = '{PRJ}';""")
check('29 أصلٌ مؤرشف يطوي ملحقه معه - لا عائلةَ شبح', ok_archived, probe)

print('\n=== cleanup ===')
sql(PURGE)
print('purged')

print(f'\n===== النتيجة: نجح {len(passed)} / فشل {len(failed)} =====')
if failed:
    for f in failed:
        print('FAILED:', f)
    sys.exit(1)
