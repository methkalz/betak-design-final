"""إثبات أن ملفات schemas/ تعيد بناء نفس القاعدة — بلا حاجة إلى Supabase CLI.

تُنشئ قاعدة مؤقتة على نفس العنقود، تطبّق ملفات schemas بالترتيب، ثم تقارن
بصمة الكتالوج (الجداول، الأعمدة، القيود، الفهارس، الviews وخياراتها، الدوال)
مع القاعدة الحية. أي فرق = drift.
"""
import sys, os, glob

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.environ.get('VPS_HELPER_DIR', HERE)
sys.path.insert(0, HELPER)
from vps import run, put_text  # noqa: E402

IID = os.environ.get('BAYTAK_INSTANCE_ID') or open(
    os.path.join(HELPER, 'instance_id.txt')).read().strip()
DB = f'supabase-db-{IID}'
SCHEMAS = os.path.join(os.path.dirname(HERE), 'schemas')
SCRATCH = 'baytak_schema_check'

FINGERPRINT = """
select string_agg(line, E'\\n' order by line) from (
  select 'T|'||table_name||'|'||column_name||'|'||data_type||'|'||is_nullable||
         '|'||coalesce(column_default,'-') as line
  from information_schema.columns where table_schema='core'
  union all
  select 'C|'||conrelid::regclass::text||'|'||conname||'|'||pg_get_constraintdef(oid)
  from pg_constraint where connamespace='core'::regnamespace
  union all
  select 'I|'||indexname||'|'||indexdef from pg_indexes where schemaname='core'
  union all
  select 'V|'||c.relname||'|'||array_to_string(coalesce(c.reloptions,'{}'),',')
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='api' and c.relkind='v'
  union all
  select 'F|'||n.nspname||'.'||p.proname||'|'||md5(pg_get_functiondef(p.oid))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('api','private')
  union all
  select 'G|'||tgname||'|'||tgrelid::regclass::text
  from pg_trigger where not tgisinternal and tgrelid::regclass::text like 'core.%'
  union all
  select 'E|'||t.typname||'|'||string_agg(e.enumlabel, ',' order by e.enumsortorder)
  from pg_type t join pg_enum e on e.enumtypid=t.oid
  join pg_namespace n on n.oid=t.typnamespace
  where n.nspname='core' group by t.typname
) s;
"""


def psql(db, sql, extra=''):
    put_text(sql + '\n', '/tmp/d.sql')
    return run(f'docker exec -i {DB} psql -U postgres -d {db} {extra} < /tmp/d.sql 2>&1')


print('=== teardown any previous scratch db ===')
print(run(f'docker exec {DB} psql -U postgres -c "drop database if exists {SCRATCH};" 2>&1').strip())

print('\n=== create scratch db ===')
print(run(f'docker exec {DB} psql -U postgres -c "create database {SCRATCH};" 2>&1').strip())

print('\n=== stub the auth surface the schemas depend on ===')
stub = """
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
select 'stub ready';
"""
print(psql(SCRATCH, stub, '-tA').strip())

print('\n=== apply schema files in lexical order ===')
files = sorted(glob.glob(os.path.join(SCHEMAS, '*.sql')))
failed = False
for f in files:
    name = os.path.basename(f)
    body = open(f, encoding='utf-8').read()
    put_text(body, '/tmp/s.sql')
    out = run(f'docker exec -i {DB} psql -U postgres -d {SCRATCH} -q -v ON_ERROR_STOP=1 '
              f'< /tmp/s.sql 2>&1; echo "RC=$?"')
    ok = 'RC=0' in out
    print(f'  {"OK  " if ok else "FAIL"} {name}')
    if not ok:
        noise = '\n'.join(l for l in out.splitlines()
                          if l.strip() and not l.startswith('RC=') and 'NOTICE' not in l)
        print('       ' + noise.replace('\n', '\n       ')[:900])
        failed = True
        break

if not failed:
    print('\n=== compare catalog fingerprints ===')
    put_text(FINGERPRINT, '/tmp/fp.sql')
    live = run(f'docker exec -i {DB} psql -U postgres -d postgres -tA < /tmp/fp.sql 2>&1')
    scratch = run(f'docker exec -i {DB} psql -U postgres -d {SCRATCH} -tA < /tmp/fp.sql 2>&1')

    lset = set(l for l in live.split('\n') if l.strip())
    sset = set(l for l in scratch.split('\n') if l.strip())
    only_live = sorted(lset - sset)
    only_scratch = sorted(sset - lset)

    print(f'live objects   : {len(lset)}')
    print(f'schema objects : {len(sset)}')
    print(f'\nin LIVE but not in schemas ({len(only_live)}):')
    for x in only_live[:25]:
        print('  -', x[:150])
    if len(only_live) > 25:
        print(f'  … +{len(only_live)-25} more')
    print(f'\nin SCHEMAS but not live ({len(only_scratch)}):')
    for x in only_scratch[:25]:
        print('  +', x[:150])
    if len(only_scratch) > 25:
        print(f'  … +{len(only_scratch)-25} more')

    print('\n=== VERDICT ===')
    print('NO DRIFT' if not only_live and not only_scratch
          else f'DRIFT: {len(only_live)} missing, {len(only_scratch)} extra')

print('\n=== teardown ===')
print(run(f'docker exec {DB} psql -U postgres -c "drop database if exists {SCRATCH};" 2>&1').strip())
run('rm -f /tmp/d.sql /tmp/s.sql /tmp/fp.sql')
