"""مشغّل مجموعة RLS وسطح الكتابة (rls_policies.sql) — صالح للـVPS وللـCI.

الملف كله transaction ينتهي بـ ROLLBACK؛ التأكيدات المقصود فشلها تُلتقط داخله
وتُطبع كأعمدة must_be_* أو NOTICE «OK blocked» — فلا يظهر ERROR إطلاقًا في
تشغيل سليم. معيار النجاح هنا: صفر أسطر ERROR + وصول التنفيذ إلى النتائج.
"""
import sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.environ.get('VPS_HELPER_DIR', HERE)
sys.path.insert(0, HELPER)
from vps import run, put_text  # noqa: E402

IID = os.environ.get('BAYTAK_INSTANCE_ID') or open(
    os.path.join(HELPER, 'instance_id.txt')).read().strip()
DB = os.environ.get('BAYTAK_DB_CONTAINER') or f'supabase-db-{IID}'

sql = open(os.path.join(HERE, 'rls_policies.sql'), encoding='utf-8').read()
put_text(sql, '/tmp/rls_suite.sql')
out = run(f'docker exec -i {DB} psql -U postgres -q < /tmp/rls_suite.sql', timeout=600)
run('rm -f /tmp/rls_suite.sql')

errors = [l for l in out.splitlines() if 'ERROR' in l]
ran = 'RESULTS' in out

print(out[-2000:])
print()
if errors:
    print('FAILED — أسطر ERROR:')
    for e in errors[:10]:
        print('  ', e)
    sys.exit(1)
if not ran:
    print('FAILED — المجموعة لم تصل إلى قسم النتائج')
    sys.exit(1)
print('===== RLS suite: clean (no ERROR lines, suite completed) =====')
