"""توليد supabase/schemas/ من التعريفات الحية المستخرجة."""
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'extracted')
DST = r'C:\Qinova\Betak Design\App\github\supabase\schemas'
os.makedirs(DST, exist_ok=True)

HDR = ('-- ════════════════════════════════════════════════════════════════════\n'
       '-- {title}\n'
       '-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)\n'
       '-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.\n'
       '-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.\n'
       '-- ════════════════════════════════════════════════════════════════════\n\n')


def write(name, title, body):
    p = os.path.join(DST, name)
    with open(p, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(HDR.format(title=title) + body.rstrip() + '\n')
    print(f'  {name:44} {len(body):>7} bytes')


raw = open(os.path.join(SRC, 'functions.txt'), encoding='utf-8').read()
funcs = {}
for block in raw.split('-- ##FUNC ')[1:]:
    head, _, body = block.partition('\n')
    funcs[head.strip()] = body.strip()

print('generating schema files:')

# ترتيب اعتماديات صريح — الترتيب الأبجدي يكسر البناء
IDENTITY = ['private.current_uid', 'private.in_rpc']
PERMS = ['private.is_org_member', 'private.role_in', 'private.has_role',
         'private.is_admin', 'private.is_financially_blind', 'private.can_see_project']
INVHELP = ['private.reservation_remaining', 'private.roll_balance',
           'private.reservation_status_for']
# canonical قبل fingerprint — دالة SQL تستدعيها الأخرى نصيًا
PRICING = ['private.price_project_windows',
           'private.quotation_content_canonical',
           'private.version_content_fingerprint']
GUARDS = ['private.block_mutation', 'private.block_delete',
          'private.enforce_reason_scope',
          'private.guard_project_update', 'private.guard_locked_version',
          'private.guard_locked_items']

declared = set(IDENTITY + PERMS + INVHELP + PRICING + GUARDS)
missing = [k for k in funcs if k.startswith('private.') and k not in declared]
assert not missing, f'دوال private غير مصنفة: {missing}'

write('30_private_identity_functions.sql', 'دوال الهوية',
      '\n\n'.join(funcs[k] + ';' for k in IDENTITY))
write('31_private_permission_functions.sql', 'دوال الصلاحيات — بترتيب الاعتماد',
      '\n\n'.join(funcs[k] + ';' for k in PERMS))
write('32_private_inventory_helpers.sql', 'مساعدات المخزون',
      '\n\n'.join(funcs[k] + ';' for k in INVHELP))
write('33_private_pricing_engine.sql',
      'محرك التسعير والبصمة القانونية fp1 (§10 هـ + ح-1)',
      '\n\n'.join(funcs[k] + ';' for k in PRICING))
write('35_private_guard_functions.sql', 'دوال الحُرّاس (تستدعيها triggers)',
      '\n\n'.join(funcs[k] + ';' for k in GUARDS))

API_FILES = [
    ('api.reserve_fabric', '50_api_reserve_fabric.sql'),
    ('api.consume_fabric', '51_api_consume_fabric.sql'),
    ('api.release_reservation', '52_api_release_reservation.sql'),
    ('api.return_consumed_fabric', '53_api_return_consumed_fabric.sql'),
    ('api.record_reserved_damage', '54_api_record_reserved_damage.sql'),
    ('api.record_stock_damage', '55_api_record_stock_damage.sql'),
    ('api.create_quotation_version', '56_api_create_quotation_version.sql'),
    ('api.send_quotation_version', '57_api_send_quotation_version.sql'),
    ('api.approve_quotation_version', '58_api_approve_quotation_version.sql'),
    ('api.reject_quotation_version', '59_api_reject_quotation_version.sql'),
]
api_declared = {k for k, _ in API_FILES}
api_live = {k for k in funcs if k.startswith('api.')}
assert api_live == api_declared, f'دوال api غير مصنفة: {api_live ^ api_declared}'
for key, fname in API_FILES:
    write(fname, key, funcs[key] + ';')

vraw = open(os.path.join(SRC, 'views.txt'), encoding='utf-8').read()
vdefs = {}
for block in vraw.split('-- ##VIEW ')[1:]:
    head, _, body = block.partition('\n')
    m = re.match(r'(\S+)\s*\[(.*)\]', head.strip())
    full, opts = m.group(1), m.group(2)
    short = full.split('.', 1)[1]
    assert 'security_invoker=on' in opts, f'{full} missing security_invoker!'
    vdefs[short] = (full, body.strip().rstrip(';'))

# فرز طوبولوجي (Kahn) — الاعتماد لا الأبجدية
deps = {v: set() for v in vdefs}
for line in open(os.path.join(SRC, 'view_deps.txt'), encoding='utf-8'):
    if '|' in line:
        dependent, referenced = line.strip().split('|', 1)
        if dependent in deps and referenced in vdefs:
            deps[dependent].add(referenced)

order, remaining = [], dict(deps)
while remaining:
    ready = sorted(v for v, d in remaining.items() if not (d - set(order)))
    if not ready:
        raise SystemExit(f'دورة اعتماد بين الviews: {sorted(remaining)}')
    for v in ready:
        order.append(v)
        remaining.pop(v)

print(f'  (view order adjusted for dependencies; {len(order)} views)')

parts = [f'create or replace view {vdefs[v][0]}\n  with (security_invoker = on) as\n'
         f'{vdefs[v][1]};' for v in order]
write('40_api_views.sql',
      f'الviews ({len(parts)}) — كلها security_invoker، بترتيب الاعتماد لا الأبجدية',
      '\n\n'.join(parts))

dump = open(os.path.join(SRC, 'core_dump.sql'), encoding='utf-8').read()
stmts, buf = [], []
for line in dump.split('\n'):
    if line.startswith('--') or line.startswith('SET ') or line.startswith('SELECT pg_catalog'):
        continue
    buf.append(line)
    if line.rstrip().endswith(';'):
        s = '\n'.join(buf).strip()
        if s:
            stmts.append(s)
        buf = []

buckets = {'types': [], 'tables': [], 'defaults': [], 'constraints': [], 'indexes': [],
           'rls': [], 'triggers': [], 'comments': [], 'other': []}
for s in stmts:
    u = s.upper()
    if u.startswith('CREATE TYPE'):
        buckets['types'].append(s)
    elif u.startswith('CREATE TABLE'):
        buckets['tables'].append(s)
    elif u.startswith('ALTER TABLE') and 'ADD CONSTRAINT' in u:
        buckets['constraints'].append(s)
    elif u.startswith('ALTER TABLE') and 'ROW LEVEL SECURITY' in u:
        buckets['rls'].append(s)
    elif u.startswith('CREATE POLICY'):
        buckets['rls'].append(s)
    elif u.startswith('ALTER TABLE') and 'SET DEFAULT' in u:
        buckets['defaults'].append(s)
    elif u.startswith('CREATE INDEX') or u.startswith('CREATE UNIQUE INDEX'):
        buckets['indexes'].append(s)
    elif u.startswith('CREATE TRIGGER'):
        buckets['triggers'].append(s)
    elif u.startswith('COMMENT ON'):
        buckets['comments'].append(s)
    elif u.startswith('CREATE SCHEMA') or u.startswith('CREATE EXTENSION'):
        pass
    else:
        buckets['other'].append(s)

write('10_types.sql', f'أنواع enum ({len(buckets["types"])})', '\n\n'.join(buckets['types']))
write('20_core_tables.sql',
      f'الجداول ({len(buckets["tables"])}) والقيم الافتراضية ({len(buckets["defaults"])})',
      '\n\n'.join(buckets['tables']) + '\n\n' + '\n'.join(buckets['defaults']))
# الفهارس قبل القيود: FK خماسي يستهدف فهرسًا فريدًا على fabric_usage
write('25_indexes.sql', f'الفهارس ({len(buckets["indexes"])}) — قبل القيود عمدًا',
      '\n'.join(buckets['indexes']))
write('26_constraints.sql', f'القيود والمفاتيح ({len(buckets["constraints"])})',
      '\n'.join(buckets['constraints']))
write('60_rls_policies.sql',
      f'تفعيل RLS والسياسات ({len(buckets["rls"])}) — بعد دوال private لأنها تستدعيها',
      '\n'.join(buckets['rls']))
write('70_triggers.sql', f'الـtriggers ({len(buckets["triggers"])})', '\n'.join(buckets['triggers']))
write('80_comments.sql', f'التعليقات ({len(buckets["comments"])})', '\n'.join(buckets['comments']))

if buckets['other']:
    print(f'unbucketed statements: {len(buckets["other"])}')
    write('99_unclassified.sql', 'عبارات لم تصنف — راجعها', '\n\n'.join(buckets['other']))
else:
    print('all statements bucketed cleanly')
