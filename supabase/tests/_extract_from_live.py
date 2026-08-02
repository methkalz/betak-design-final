"""استخراج التعريفات الحية من القاعدة — لا من الذاكرة ولا من ملفات الترحيل."""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vps import run, put_text

HERE = os.path.dirname(os.path.abspath(__file__))
IID = open(os.path.join(HERE, 'instance_id.txt')).read().strip()
DB = f'supabase-db-{IID}'
OUT = os.path.join(HERE, 'extracted')
os.makedirs(OUT, exist_ok=True)


def q(sql):
    put_text(sql + '\n', '/tmp/x.sql')
    return run(f'docker exec -i {DB} psql -U postgres -tA -F "|" < /tmp/x.sql 2>&1')


print('=== inventory of live objects ===')
print('enum types      :', q("select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='core' and t.typtype='e'").strip())
print('tables          :', q("select count(*) from pg_tables where schemaname='core'").strip())
print('views (api)     :', q("select count(*) from pg_views where schemaname='api'").strip())
print('functions priv  :', q("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'").strip())
print('functions api   :', q("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api'").strip())
print('triggers        :', q("select count(*) from pg_trigger where not tgisinternal and tgrelid::regclass::text like 'core.%'").strip())

# ── الدوال: pg_get_functiondef يعطي التعريف الكامل الموثوق ───────────────────
print('\n=== extracting functions ===')
rows = q("""
select n.nspname || '|' || p.proname || '|' ||
       pg_get_function_identity_arguments(p.oid) || '|' ||
       replace(pg_get_functiondef(p.oid), E'\\n', '~~NL~~')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('private','api')
order by n.nspname, p.proname;
""")
funcs = []
for line in rows.split('\n'):
    parts = line.split('|', 3)
    if len(parts) == 4 and parts[0] in ('private', 'api'):
        schema, name, args, body = parts
        funcs.append((schema, name, args, body.replace('~~NL~~', '\n')))
print(f'extracted {len(funcs)} functions')
for s, n, a, _ in funcs:
    print(f'  {s}.{n}({a[:60]})')

with open(os.path.join(OUT, 'functions.txt'), 'w', encoding='utf-8', newline='\n') as fh:
    for s, n, a, b in funcs:
        fh.write(f'-- ##FUNC {s}.{n}\n{b}\n\n')

# ── الviews: نحتاج التعريف + خيار security_invoker + الأعمدة ────────────────
print('\n=== extracting views ===')
vrows = q("""
select c.relname || '|' ||
       coalesce(array_to_string(c.reloptions, ','), '') || '|' ||
       replace(pg_get_viewdef(c.oid, true), E'\\n', '~~NL~~')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'api' and c.relkind = 'v'
order by c.relname;
""")
views = []
for line in vrows.split('\n'):
    parts = line.split('|', 2)
    if len(parts) == 3 and parts[0].strip():
        views.append((parts[0], parts[1], parts[2].replace('~~NL~~', '\n')))
print(f'extracted {len(views)} views')
missing_inv = [v for v, o, _ in views if 'security_invoker=on' not in o]
print('views missing security_invoker:', missing_inv or '(none)')

with open(os.path.join(OUT, 'views.txt'), 'w', encoding='utf-8', newline='\n') as fh:
    for name, opts, body in views:
        fh.write(f'-- ##VIEW api.{name} [{opts}]\n{body}\n\n')

# اعتماديات view → view، لأن الترتيب الأبجدي يكسر البناء
# (fabric_rolls تسبق roll_balances أبجديًا لكنها تعتمد عليها)
edges = q("""
select distinct dependent.relname || '|' || referenced.relname
from pg_rewrite r
join pg_class dependent on dependent.oid = r.ev_class
join pg_depend d on d.objid = r.oid and d.classid = 'pg_rewrite'::regclass
join pg_class referenced on referenced.oid = d.refobjid
join pg_namespace nd on nd.oid = dependent.relnamespace
join pg_namespace nr on nr.oid = referenced.relnamespace
where nd.nspname = 'api' and dependent.relkind = 'v'
  and nr.nspname = 'api' and referenced.relkind = 'v'
  and dependent.oid <> referenced.oid;
""")
with open(os.path.join(OUT, 'view_deps.txt'), 'w', encoding='utf-8', newline='\n') as fh:
    fh.write(edges)
print('view→view dependency edges:')
for line in edges.split('\n'):
    if '|' in line:
        print('  ', line.replace('|', '  depends on  '))

# ── pg_dump للبنية: أنواع، جداول، قيود، فهارس، triggers ─────────────────────
print('\n=== pg_dump structural (core) ===')
run(f"docker exec {DB} pg_dump -U postgres --schema-only --no-owner --no-privileges "
    f"--schema=core > /tmp/core_dump.sql 2>/dev/null")
size = run("wc -c < /tmp/core_dump.sql").strip()
print('core dump bytes:', size)
run(f'docker cp /dev/null /dev/null 2>/dev/null; true')
dump = run('cat /tmp/core_dump.sql')
with open(os.path.join(OUT, 'core_dump.sql'), 'w', encoding='utf-8', newline='\n') as fh:
    fh.write(dump)

print('\n=== grants / ownership snapshot (db diff does NOT track these) ===')
print(q("""
select 'FUNC_OWNER|' || n.nspname || '.' || p.proname || '|' || p.proowner::regrole::text
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('api','private') order by 1;
"""))
run('rm -f /tmp/x.sql /tmp/core_dump.sql')
print(f'\nwritten to {OUT}')
