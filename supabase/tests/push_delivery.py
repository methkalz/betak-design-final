"""إشعارات الهاتف: تسجيل الجهاز، والإرسال على كلّ إشعار، ومعالجة ردود Expo.

لا طلب حقيقيّ يخرج من هذه المجموعة: الإرسال بـapp.push_dry_run، وردود Expo
تُمرَّر نصًّا إلى apply_push_ticket/apply_push_receipt كما يحفظها pg_net -
فتُختبر قراءة التذكرة والإيصال وحذف الجهاز الميت دون شبكةٍ ولا مستخدمٍ أعلى.
"""
import sys, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.environ.get('VPS_HELPER_DIR', HERE)
sys.path.insert(0, HELPER)
from vps import run, put_text  # noqa: E402

IID = os.environ.get('BAYTAK_INSTANCE_ID') or open(
    os.path.join(HELPER, 'instance_id.txt')).read().strip()
DB = os.environ.get('BAYTAK_DB_CONTAINER') or f'supabase-db-{IID}'

ORG = 'ffffbbbb-0000-4000-8000-000000000001'
A = 'ffffbbbb-0000-4000-8000-0000000000a1'   # أدمن
B = 'ffffbbbb-0000-4000-8000-0000000000a2'   # خياط
C = 'ffffbbbb-0000-4000-8000-0000000000a3'   # ميدانيّ أُوقف حسابه
TOK_A = 'ExponentPushToken[push-suite-aaaa]'
TOK_B = 'ExponentPushToken[push-suite-bbbb]'
TOK_SHARED = 'ExponentPushToken[push-suite-shared]'

passed, failed = [], []


def sql(text, quiet=True):
    put_text(text + '\n', '/tmp/push.sql')
    return run(f'docker exec -i {DB} psql -U postgres {"-q" if quiet else ""} < /tmp/push.sql 2>&1')


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


def scalar(text):
    out = sql(text, quiet=False)
    m = re.search(r'^\s*(\S.*?)\s*$', out.split('\n', 2)[2] if out.count('\n') >= 2 else '', re.M)
    return (m.group(1) if m else '').strip(), out


def notify(user, title, actor=None):
    """إشعارٌ كما تكتبه دوال الـAPI. actor = من نفّذ العملية (لاستثناء الفاعل)."""
    claims = (f"select set_config('request.jwt.claims','{{\"sub\":\"{actor}\"}}',false) \\g /dev/null\n"
              if actor else "select set_config('request.jwt.claims','',false) \\g /dev/null\n")
    return sql(claims + "set app.push_dry_run = 'on';\n"
               f"insert into core.notifications (organization_id,user_id,kind,title,body,deep_link)"
               f" values ('{ORG}','{user}','payment','{title}','نصّ الاختبار','/payments');", quiet=False)


PURGE = f"""
set session_replication_role = replica;
delete from core.push_deliveries      where organization_id = '{ORG}';
delete from core.user_devices         where organization_id = '{ORG}'
   or expo_push_token like 'ExponentPushToken[push-suite-%';
delete from core.notifications        where organization_id = '{ORG}';
delete from core.field_visits         where organization_id = '{ORG}';
delete from core.projects             where organization_id = '{ORG}';
delete from core.customers            where organization_id = '{ORG}';
delete from core.organization_members where organization_id = '{ORG}';
delete from core.business_settings    where organization_id = '{ORG}';
delete from core.organizations        where id = '{ORG}';
delete from core.profiles             where id in ('{A}','{B}','{C}');
delete from auth.users                where id in ('{A}','{B}','{C}');
set session_replication_role = origin;
"""

print('=== seeding ===')
users = ",\n ".join(
    f"('{u}','00000000-0000-0000-0000-000000000000','authenticated','authenticated',"
    f"'push{i}@t.local','x',now(),now(),now())" for i, u in enumerate([A, B, C]))
out = sql(PURGE + f"""
insert into core.organizations (id,name) values ('{ORG}','معرض الإشعارات');
insert into core.business_settings (organization_id) values ('{ORG}');
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,
                        email_confirmed_at,created_at,updated_at) values
 {users};
insert into core.profiles (id,full_name,phone) values
 ('{A}','أدمن الإشعارات','054-0000101'), ('{B}','خياط الإشعارات','054-0000102'),
 ('{C}','ميدانيّ موقوف','054-0000103');
insert into core.organization_members (organization_id,user_id,role,is_active) values
 ('{ORG}','{A}','admin',true), ('{ORG}','{B}','tailor',true), ('{ORG}','{C}','field',false);
""")
if 'ERROR' in out:
    print(out); sys.exit(1)
print('seeded')

# ── ١) تسجيل الجهاز ─────────────────────────────────────────────────
out = as_user(A, f"select api.register_device('{TOK_A}', 'ios')::text;")
n, probe = scalar(f"select count(*) from core.user_devices where user_id = '{A}' and expo_push_token = '{TOK_A}' and platform = 'ios';")
check('01 المستخدم يسجّل جهازه', '"registered": true' in out and n == '1', out + probe)

out = as_user(A, f"select api.register_device('{TOK_A}', 'ios')::text;")
n, probe = scalar(f"select count(*) from core.user_devices where expo_push_token = '{TOK_A}';")
check('02 إعادة التسجيل تحدّث ولا تكرّر', 'ERROR' not in out and n == '1', out + probe)

out1 = as_user(A, "select api.register_device('not-a-token', 'ios')::text;")
out2 = as_user(A, "select api.register_device('ExponentPushToken[]', 'ios')::text;")
out3 = as_user(A, f"select api.register_device('{TOK_A}', 'web')::text;")
check('03 رمزٌ بغير صيغة Expo ومنصّةٌ غير الهاتف → مرفوضة',
      all('ERROR' in o for o in (out1, out2, out3)) and 'غير صالح' in out1 and 'المنصّة' in out3,
      out1 + out2 + out3)

out = sql(f"set role authenticated;\nselect api.register_device('{TOK_B}', 'android')::text;", quiet=False)
check('04 بلا هويّة → BD403', 'ERROR' in out and 'مصادَق' in out, out)

# ── ٢) الجهاز لآخر من دخل منه ────────────────────────────────────────
as_user(A, f"select api.register_device('{TOK_SHARED}', 'android')::text;")
out = as_user(B, f"select api.register_device('{TOK_SHARED}', 'android')::text;")
owners, probe = scalar(f"select string_agg(user_id::text, ',') from core.user_devices where expo_push_token = '{TOK_SHARED}';")
check('05 هاتفٌ تبدّل عليه مستخدمان ينتقل لآخرهما ولا يبقى للأوّل', owners == B, out + probe)

out = as_user(A, f"select api.unregister_device('{TOK_SHARED}')::text;")
n, probe = scalar(f"select count(*) from core.user_devices where expo_push_token = '{TOK_SHARED}';")
check('06 الخروج يلغي جهاز صاحبه وحده - لا يلغي أحدٌ جهاز غيره', '"removed": 0' in out and n == '1', out + probe)

out = as_user(B, f"select api.unregister_device('{TOK_SHARED}')::text;")
check('07 صاحب الجهاز يلغيه عند خروجه', '"removed": 1' in out, out)

# ── ٣) الإرسال على كلّ إشعار ─────────────────────────────────────────
as_user(B, f"select api.register_device('{TOK_B}', 'android')::text;")
out = notify(B, 'دفعة اختبار', actor=A)
row, probe = scalar(f"""select d.status || '|' || d.msg_index || '|' || d.expo_push_token
  from core.push_deliveries d join core.notifications n on n.id = d.notification_id
  where n.user_id = '{B}' and n.title = 'دفعة اختبار';""")
check('08 إشعارٌ لصاحب جهاز → رسالةٌ مسجّلة لجهازه', row == f'dry_run|0|{TOK_B}', out + probe)

out = notify(B, 'فعلي أنا', actor=B)
n, probe = scalar(f"""select count(*) from core.push_deliveries d join core.notifications n on n.id = d.notification_id
  where n.title = 'فعلي أنا';""")
nn, _ = scalar("select count(*) from core.notifications where title = 'فعلي أنا';")
check('09 الفاعل لا يُنبَّه على هاتفه بفعله - والإشعار داخل التطبيق باقٍ', n == '0' and nn == '1', out + probe)

out = notify(A, 'لا جهاز', actor=B)
as_user(A, f"select api.unregister_device('{TOK_A}')::text;")
out = notify(A, 'بعد الخروج', actor=B)
n, probe = scalar(f"""select count(*) from core.push_deliveries d join core.notifications n on n.id = d.notification_id
  where n.title = 'بعد الخروج';""")
check('10 من ألغى جهازه لا تُرسل له رسالة', n == '0', out + probe)

sql(f"""insert into core.user_devices (organization_id,user_id,expo_push_token,platform)
        values ('{ORG}','{A}','ExponentPushToken[push-suite-web]','web');""")
out = notify(A, 'ويب فقط', actor=B)
n, probe = scalar(f"""select count(*) from core.push_deliveries d join core.notifications n on n.id = d.notification_id
  where n.title = 'ويب فقط';""")
check('11 جهاز الويب لا يُرسل إليه (لا إشعارات هاتف على الويب)', n == '0', out + probe)

# ── ٤) ردود Expo: التذكرة، ثم الإيصال ───────────────────────────────
# رسالتان في الطابور كما يكتبهما المحفّز، وردّا Expo نصًّا كما يحفظه pg_net
out = sql(f"""
insert into core.user_devices (organization_id,user_id,expo_push_token,platform)
values ('{ORG}','{B}','ExponentPushToken[push-suite-dead]','ios');
insert into core.push_deliveries (organization_id,notification_id,user_id,expo_push_token,msg_index,request_id,status)
select '{ORG}', n.id, '{B}', t.tok, t.idx, 990000001, 'queued'
from core.notifications n,
     (values ('{TOK_B}', 0), ('ExponentPushToken[push-suite-dead]', 1)) as t(tok, idx)
where n.title = 'دفعة اختبار';""")
TICKETS = ('{"data":[{"status":"ok","id":"push-suite-ticket-1"},'
           '{"status":"error","message":"not registered","details":{"error":"DeviceNotRegistered"}}]}')
res, probe = scalar(f"""select string_agg(private.apply_push_ticket(d.id, 200, false, null, '{TICKETS}'), ',' order by d.msg_index)
  from core.push_deliveries d where d.request_id = 990000001;""")
ok_row, _ = scalar(f"select status || '|' || coalesce(ticket_id,'-') from core.push_deliveries where request_id = 990000001 and msg_index = 0;")
dead_row, _ = scalar(f"select status || '|' || coalesce(error,'-') from core.push_deliveries where request_id = 990000001 and msg_index = 1;")
dead_dev, _ = scalar("select count(*) from core.user_devices where expo_push_token = 'ExponentPushToken[push-suite-dead]';")
check('12 تذكرة ok → sent برقم التذكرة (كلّ رسالةٍ تقرأ تذكرتها بترتيبها)',
      res == 'sent,failed' and ok_row == 'sent|push-suite-ticket-1', out + probe + ok_row)
check('13 تذكرة DeviceNotRegistered → failed ويُحذف الجهاز الميت',
      dead_row == 'failed|DeviceNotRegistered' and dead_dev == '0', probe + dead_row + dead_dev)

again, probe = scalar(f"""select coalesce(private.apply_push_ticket(d.id, 200, false, null, '{TICKETS}'), 'null')
  from core.push_deliveries d where d.request_id = 990000001 and d.msg_index = 0;""")
check('14 التذكرة تُقرأ مرّةً واحدة - إعادة المعالجة لا تغيّر شيئًا', again == 'null', probe)

res, probe = scalar(f"""select coalesce(private.apply_push_ticket(d.id, null, true, 'Timeout of 10000 ms reached', null), 'null')
  from core.push_deliveries d join core.notifications n on n.id = d.notification_id
  where n.title = 'دفعة اختبار' and d.status = 'dry_run' limit 1;""")
kept, _ = scalar(f"""select count(*) from core.push_deliveries d join core.notifications n on n.id = d.notification_id
  where n.title = 'دفعة اختبار' and d.status = 'dry_run' and d.error is null;""")
check('15 الدالّة لا تمسّ إلا ما في الطابور (dry_run يبقى كما هو)', res == 'null' and kept == '1', probe + kept)

pending, probe = scalar(f"""select string_agg(private.apply_push_receipt(d.id, '{{"data":{{}}}}'), ',')
  from core.push_deliveries d where d.ticket_id = 'push-suite-ticket-1';""")
row, _ = scalar("select status || '|' || (receipt_request_id is null)::text from core.push_deliveries where ticket_id = 'push-suite-ticket-1';")
check('16 لا إيصال بعد → يبقى sent ويُسأل مرّةً أخرى لاحقًا', pending == 'sent' and row == 'sent|true', probe + row)

done, probe = scalar("""select private.apply_push_receipt(d.id, '{"data":{"push-suite-ticket-1":{"status":"ok"}}}')
  from core.push_deliveries d where d.ticket_id = 'push-suite-ticket-1';""")
check('17 إيصال ok → delivered (سلّمته Apple/Google فعلًا)', done == 'delivered', probe)

res, probe = scalar("select private.process_push_results()::text;")
check('18 المعالجة الدورية تعمل على قاعدةٍ حقيقية بلا خطأ', 'ERROR' not in probe and '"tickets"' in res, probe)

# ── ٥) الحصانة ──────────────────────────────────────────────────────
out = as_user(B, "select count(*) from core.push_deliveries;")
check('19 سجلّ التسليم مغلقٌ على المستخدمين', 'ERROR' in out and 'permission denied' in out, out)

out = as_user(B, "select private.process_push_results();")
check('20 المستخدم لا يشغّل معالجة النتائج', 'ERROR' in out and 'permission denied' in out, out)

job, probe = scalar("select schedule || '|' || command from cron.job where jobname = 'baytak-push-results';")
check('21 المهمّة الدورية مجدولة كلّ دقيقة', job == '* * * * *|select private.process_push_results()', probe)

# ── ٦) تذكير موعد الغد ───────────────────────────────────────────────
TZ = 'Asia/Jerusalem'
LOCAL_DAY = f"date_trunc('day', now() at time zone '{TZ}')"


def at_local(offset):
    """لحظةٌ بتوقيت المحلّ نسبةً إلى بداية يومه: '19 hours' أو '1 day 10 hours 30 minutes'."""
    return f"(({LOCAL_DAY} + interval '{offset}') at time zone '{TZ}')"


V1, V2, V3, V4 = (f'ffffbbbb-0000-4000-8000-0000000000c{i}' for i in range(1, 5))
CUST, PRJ = 'ffffbbbb-0000-4000-8000-0000000000b1', 'ffffbbbb-0000-4000-8000-0000000000b2'
out = sql(f"""
insert into core.customers (id,organization_id,full_name,phone,city)
values ('{CUST}','{ORG}','زبون التذكير','052-0000001','كفرمندا');
insert into core.projects (id,organization_id,customer_id,code,title,status_code)
values ('{PRJ}','{ORG}','{CUST}','BD-PUSH-1','بيت التذكير','measured');
insert into core.field_visits (id,organization_id,project_id,assignee_id,type,status,scheduled_at) values
 ('{V1}','{ORG}','{PRJ}','{B}','measurement','scheduled', {at_local('1 day 10 hours 30 minutes')}),
 ('{V2}','{ORG}','{PRJ}','{B}','installation','completed', {at_local('1 day 12 hours')}),
 ('{V3}','{ORG}','{PRJ}','{B}','installation','scheduled', {at_local('2 days 9 hours')}),
 ('{V4}','{ORG}','{PRJ}','{C}','measurement','scheduled', {at_local('1 day 11 hours')});
""", quiet=False)
check('22 زرع زيارات الغد', 'ERROR' not in out, out)

n, probe = scalar(f"select private.send_visit_reminders({at_local('15 hours')});")
check('23 قبل السادسة مساءً بتوقيت المحلّ لا تذكير', n == '0', probe)

n, probe = scalar(f"select private.send_visit_reminders({at_local('19 hours')});")
row, _ = scalar(f"""select title || '|' || body || '|' || deep_link from core.notifications
  where kind = 'appointment_tomorrow' and user_id = '{B}';""")
check('24 مساءً: تذكيرٌ واحد لزيارة الغد المجدولة وحدها، لصاحبها، برابطها',
      n == '1' and row == f'تذكير: زيارة قياس غدًا|بيت التذكير · الساعة 10:30 · كفرمندا|/visit/{V1}',
      probe + row)

none, probe = scalar(f"select count(*) from core.notifications where kind = 'appointment_tomorrow' and user_id = '{C}';")
check('25 من أُوقف حسابه لا يُذكَّر، ولا المنتهية، ولا ما بعد الغد', none == '0', probe)

n, probe = scalar(f"select private.send_visit_reminders({at_local('21 hours')});")
check('26 الساعة التالية لا تكرّر التذكير', n == '0', probe)

out = sql("select set_config('request.jwt.claims','',false) \\g /dev/null\n"
          "set app.push_dry_run = 'on';\n"
          f"update core.field_visits set scheduled_at = {at_local('1 day 16 hours')} where id = '{V3}';\n"
          f"select private.send_visit_reminders({at_local('22 hours')});", quiet=False)
row, probe = scalar(f"""select d.status from core.push_deliveries d join core.notifications n on n.id = d.notification_id
  where n.kind = 'appointment_tomorrow' and n.deep_link = '/visit/{V3}';""")
check('27 زيارةٌ نُقلت إلى الغد مساءً يصل تذكيرها، ويذهب إلى هاتف صاحبها', row == 'dry_run', out + probe)

job, probe = scalar("select schedule || '|' || command from cron.job where jobname = 'baytak-visit-reminders';")
check('28 مهمّة التذكير مجدولة كلّ ساعة', job == '0 * * * *|select private.send_visit_reminders()', probe)

print('\n=== cleanup ===')
sql(PURGE)

print(f'\n{len(passed)} passed, {len(failed)} failed')
if failed:
    for f in failed:
        print('  FAIL', f)
    sys.exit(1)
