# نشر نسخة الويب المكتبية

نسخة الويب **نفس كود التطبيق** (react-native-web) — لا مشروع منفصل. فأيّ
تعديلٍ لاحق يظهر في الهاتف والويب معًا، وهذا شرطُ المالك المعلَن.

## البناء (على جهاز التطوير)

```bash
cd expo
bun run build-web          # يُخرج expo/dist
tar -czf betak-web.tar.gz -C dist .
```

> ⚠️ يجب أن يكون `expo/.env` حاضرًا وقت البناء: متغيّرا
> `EXPO_PUBLIC_SUPABASE_URL` و`EXPO_PUBLIC_SUPABASE_ANON_KEY` **تُطبع داخل
> الحزمة**. لهذا **لا تُبنى نسخةُ النشر في CI** — بوابة CI بلا أسرار عمدًا،
> وحزمتُها حارسُ ترجمةٍ لا بناءٌ صالحٌ للنشر.
>
> المفتاحان عامّان بالتصميم (الحماية الحقيقية هي RLS لا إخفاء المفتاح).

## أوّل مرّة على الخادم

```bash
# ١) الشهادة (النطاق يجب أن يشير للخادم أولًا)
sudo mkdir -p /var/www/certbot
sudo certbot certonly --webroot -w /var/www/certbot -d betakd.com -d www.betakd.com

# ٢) إعداد nginx
sudo cp nginx-betakd.conf /etc/nginx/sites-available/betakd.conf
sudo ln -s /etc/nginx/sites-available/betakd.conf /etc/nginx/sites-enabled/
sudo mkdir -p /var/www/betak-web/releases
sudo nginx -t && sudo systemctl reload nginx
```

## كلّ نشرٍ بعد ذلك

ارفع `betak-web.tar.gz` إلى الخادم ثمّ:

```bash
sudo bash deploy-web.sh /root/betak-web.tar.gz
```

التبديل **ذرّيّ** برابطٍ رمزيّ: لا لحظة يرى فيها زائرٌ نصفَ نشر. والسكربت
يُبقي آخر خمسة إصدارات، فالتراجع سطرٌ واحد يطبعه لك عند الانتهاء.

## التحقّق بعد النشر

```bash
curl -I https://betakd.com                 # 200، و Cache-Control: no-store
curl -I https://betakd.com/project/x       # 200 أيضًا (وليس 404) - ارتداد SPA
curl -I https://betakd.com/_expo/static/   # immutable
```

ثمّ افتح المتصفّح وسجّل الدخول، وتأكّد أن الشريط الجانبي يظهر وأن الأرقام
تصل من Supabase.

## ملاحظات

- **CORS لا يلزمه شيء**: Kong يردّ `access-control-allow-origin: *` (مفحوص).
- **جلسة الويب تنتهي بعد نصف ساعة خمول** (`domain/idle.ts`) — الأجهزة
  المكتبية مشتركة.
- **تغيير عنوان Supabase يستلزم إعادة بناء** لا تعديلَ ملفٍّ على الخادم:
  المتغيّرات تُطبع في الحزمة وقت البناء.
- `web.output: "single"` أي تطبيقُ صفحةٍ واحدة — وهو الصحيح لنظامٍ داخليّ
  خلف تسجيل دخول، ولهذا يلزم ارتداد `try_files` في nginx.
