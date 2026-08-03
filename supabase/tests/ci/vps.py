"""بديل محلي لمساعد الـVPS — لبيئة CI حصرًا.

نفس واجهة vps.py (run / put_text) لكن التنفيذ محلي على الـrunner:
المجموعات تنادي `docker exec supabase_db_… psql` على حاويات ستاك Supabase
المحلي الذي أقلعه `supabase start`، فلا SSH ولا مفاتيح ولا اتصال بأي سيرفر حي.

يُفعَّل بتوجيه VPS_HELPER_DIR إلى هذا المجلد (الـworkflow يفعل ذلك).
"""
import subprocess


def run(cmd, timeout=180, check=False):
    """ينفّذ أمر صدفة محليًا ويعيد stdout+stderr بنفس دلالات vps.run."""
    p = subprocess.run(['bash', '-c', cmd], capture_output=True,
                       text=True, timeout=timeout)
    stdout, stderr = p.stdout, p.stderr
    if check and p.returncode != 0:
        raise RuntimeError(f'exit {p.returncode}\n{stdout}\n{stderr}')
    text = stdout
    if stderr.strip():
        text += ('\n[stderr] ' + stderr if stdout else '[stderr] ' + stderr)
    return text.rstrip()


def put_text(text, remote_path):
    """يكتب نصًا إلى مسار محلي (المسارات /tmp/... تعمل كما هي على الـrunner)."""
    with open(remote_path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(text.replace('\r\n', '\n'))
    return len(text)
