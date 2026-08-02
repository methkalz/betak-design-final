"""اختبار الهوية عبر HTTP — الطبقة الكاملة: Kong ← PostgREST ← RLS.

يصكّ JWT حقيقيًا بسرّ المشروع (يُقرأ من ‎.env المتجاهَل من git — لا سرّ هنا)
ثم يثبت عبر HTTP فعلي:

  1. JWT صالح → 200 وبيانات مرجعية كاملة (project_statuses).
  2. بلا JWT (anon) → مرفوض. anon لا يملك حتى USAGE على سكيما api.
  3. JWT بتوقيع مزوّر → مرفوض. التوقيع يُفحص فعلًا.
  4. JWT صالح لمستخدم ليس عضوًا في أي مؤسسة → 200 مع [] فارغة.
     عزل المستأجرين يعمل عبر HTTP لا في SQL فقط.
  5. سكيما private غير معروضة → أي Accept-Profile لها يُرفض.

لماذا هذا الاختبار موجود: أثبتنا سابقًا أن PostgREST يضبط request.jwt.claims
(JSON) ولا يضبط request.jwt.claim.sub — فأي تعديل مستقبلي على
private.current_uid() يجب أن يمرّ من هنا قبل أن يصل الإنتاج.
"""
import sys, os, json, base64, hmac, hashlib, time

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.environ.get('VPS_HELPER_DIR', HERE)
sys.path.insert(0, HELPER)
from vps import run  # noqa: E402

REPO = os.path.dirname(os.path.dirname(HERE))
ENV_PATH = os.path.join(REPO, '.env')

env = {}
with open(ENV_PATH, encoding='utf-8') as fh:
    for line in fh:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k] = v

URL = env['SUPABASE_URL']
ANON = env['SUPABASE_ANON_KEY']
SECRET = env['SUPABASE_JWT_SECRET']

passed, failed = [], []


def check(name, ok, detail=''):
    (passed if ok else failed).append(name)
    print(f'{"PASS" if ok else "FAIL"}  {name}')
    if not ok and detail:
        print('      ' + str(detail).strip()[:400])


def b64url(data: bytes) -> bytes:
    return base64.urlsafe_b64encode(data).rstrip(b'=')


def mint(secret: str, sub: str) -> str:
    now = int(time.time())
    hdr = b64url(json.dumps({'alg': 'HS256', 'typ': 'JWT'},
                            separators=(',', ':')).encode())
    pl = b64url(json.dumps({
        'sub': sub, 'role': 'authenticated', 'aud': 'authenticated',
        'iat': now, 'exp': now + 3600,
    }, separators=(',', ':')).encode())
    sig = b64url(hmac.new(secret.encode(), hdr + b'.' + pl, hashlib.sha256).digest())
    return (hdr + b'.' + pl + b'.' + sig).decode()


# sub عشوائي غير موجود في auth.users — مقصود: يثبت أن غير العضو يرى فراغًا
GHOST = 'eeee0000-0000-4000-8000-00000000e001'
GOOD = mint(SECRET, GHOST)
FORGED = mint('wrong-secret-wrong-secret-wrong!', GHOST)


def http(path, jwt=None, profile='api'):
    auth = f'-H "Authorization: Bearer {jwt}" ' if jwt else ''
    out = run(
        f'curl -s -m 25 -w "\\n%{{http_code}}" '
        f'-H "apikey: {ANON}" {auth}'
        f'-H "Accept-Profile: {profile}" '
        f'"{URL}{path}"'
    )
    body, _, code = out.rpartition('\n')
    return code.strip(), body.strip()


print(f'target: {URL}\n')

code, body = http('/rest/v1/project_statuses?select=status_code&order=sort_order', GOOD)
check('1) JWT صالح → 200 وعشر حالات مشروع',
      code == '200' and body.count('status_code') == 10 and 'new_request' in body,
      f'http={code} body={body[:200]}')

code, body = http('/rest/v1/project_statuses?select=status_code')
check('2) بلا JWT (anon) → مرفوض', code in ('401', '403'), f'http={code} {body[:200]}')

code, body = http('/rest/v1/project_statuses?select=status_code', FORGED)
check('3) توقيع مزوّر → مرفوض', code in ('401', '403'), f'http={code} {body[:200]}')

code, body = http('/rest/v1/customers?select=customer_id', GOOD)
check('4) مستخدم بلا عضوية → 200 مع قائمة فارغة (عزل المستأجرين عبر HTTP)',
      code == '200' and body.strip() == '[]', f'http={code} body={body[:200]}')

code, body = http('/rest/v1/is_org_member', GOOD, profile='private')
check('5) سكيما private غير معروضة', code != '200', f'http={code} {body[:200]}')

print(f'\n===== {len(passed)} passed, {len(failed)} failed =====')
for f in failed:
    print('  FAILED:', f)
sys.exit(1 if failed else 0)
