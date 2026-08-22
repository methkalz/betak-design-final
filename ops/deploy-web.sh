#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# نشر نسخة الويب على الخادم - يُنفَّذ **على الخادم** لا على جهاز التطوير.
#
#   sudo bash deploy-web.sh /root/betak-web.tar.gz
#
# لماذا رابطٌ رمزيّ لا نسخٌ فوق القديم: التبديل ذرّيّ - لا لحظة يرى فيها
# زائرٌ نصفَ نشر. والتراجع إعادةُ توجيه الرابط لا إعادةُ رفع.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

TARBALL="${1:?الاستعمال: deploy-web.sh <مسار betak-web.tar.gz>}"
ROOT=/var/www/betak-web
KEEP=5

[ -f "$TARBALL" ] || { echo "لا ملفّ عند: $TARBALL" >&2; exit 1; }

TS=$(date +%Y%m%d-%H%M%S)
REL="$ROOT/releases/$TS"
mkdir -p "$REL"
tar -xzf "$TARBALL" -C "$REL"

# فحصُ سلامةٍ قبل التبديل: إصدارٌ بلا index يكسر الموقع كلّه
[ -f "$REL/index.html" ] || { echo "الحزمة بلا index.html - أُلغي النشر" >&2; rm -rf "$REL"; exit 1; }

ln -sfn "$REL" "$ROOT/current"
nginx -t
systemctl reload nginx

# إبقاء آخر خمسة إصدارات - يكفي للتراجع ولا يملأ القرص
ls -1dt "$ROOT"/releases/*/ 2>/dev/null | tail -n "+$((KEEP + 1))" | xargs -r rm -rf

echo "✅ نُشر الإصدار $TS"
echo "   للتراجع:  ln -sfn $ROOT/releases/<إصدار-أقدم> $ROOT/current && systemctl reload nginx"
ls -1dt "$ROOT"/releases/*/ | head -n "$KEEP"
