# قاعدة بيانات بيتك ديزاين

مخطط Supabase مشتقّ من [`expo/types/domain.ts`](../expo/types/domain.ts) ومن دليل الفريق
(`baytak-design-team-manual/database.html` و `sql.html` و `security.html`).

## النسخة الحيّة

| | |
|---|---|
| الرابط | `https://supabase-baytak.qinova.link` |
| Studio | نفس الرابط (اعتمادات النسخة في `.env` المتجاهَل) |
| معرّف النسخة | `se3nf6ovhfq3qr3sjxzi9yba` |
| حاوية القاعدة | `supabase-db-se3nf6ovhfq3qr3sjxzi9yba` |
| PostgreSQL | 15.8 |
| المفاتيح | جذر `.env` (تشغيل) و `expo/.env` (العميل) — كلاهما متجاهَل من git |

## الحالة

| الطبقة | الحالة |
|---|---|
| السكيمات والأنواع | ✅ **مُطبَّقة** |
| الجداول الـ28 | ✅ **مُطبَّقة** |
| القيود والمفاتيح المركبة | ✅ **مُطبَّقة** (77 مفتاحًا، 76 قيد تحقق) |
| الفهارس | ✅ **مُطبَّقة** (99) |
| دوال `private` | ✅ **مُطبَّقة** (6) |
| RLS والسياسات | ✅ **مُطبَّقة** (48 سياسة، RLS مفعّلة ومفروضة 28/28) |
| views في `api` | ✅ **مُطبَّقة** — كلها `security_invoker` |
| سطح الكتابة (views تمريرية + منح) | ✅ **مُطبَّق** |
| حُرّاس السلامة (triggers) | ✅ **مُطبَّقون** |
| اختبار RLS والكتابة | ✅ **34/34** — [tests/rls_policies.sql](tests/rls_policies.sql) |
| `api.reserve_fabric` | ✅ **15/15** — [tests/reserve_fabric.py](tests/reserve_fabric.py) |
| **بقية RPCs** | ❌ التالي |
| **Storage buckets وسياساتها** | ❌ |
| **بيانات العرض التجريبي** | ❌ |

اصطلاح التسمية (انظر [DECISIONS.md](../DECISIONS.md)):
`api.<entity>` تمريري قابل للكتابة · `_details` مثرى للقراءة ·
`_summary` تجميعي · `_financials` محكوم بشرط دور.

طُبِّقت جميع الترحيلات بنجاح في 2026-08-02، ومسجَّلة في
`supabase_migrations.schema_migrations` فلن يعيد `supabase db push` تشغيلها.

## الجداول الـ28

مطابقة تمامًا لقائمة `database.html`:

```
الهوية       organizations · profiles · organization_members · business_settings · user_devices
المكتبة      fabric_products · fabric_variants · fabric_rolls · pricing_rules
المشاريع     customers · project_statuses · projects · rooms · windows
المخزون      fabric_reservations · stock_movements · fabric_usage
المبيعات     quotations · quotation_versions · quotation_items · discount_requests
التشغيل      tailor_assignments · field_visits · payments · attachments
النظام       notifications · audit_logs · client_operations
```

## اختلافات مقصودة عن `types/domain.ts`

النموذج الأولي في التطبيق قاعدة بيانات على جهاز واحد بمستخدم واحد فعليًا. هذه
تعديلات فرضها الانتقال إلى نظام متعدد المستأجرين حقيقي:

| # | الفرق | السبب |
|---|---|---|
| 1 | `Profile.organizationId` و `role` انتقلا إلى `organization_members` | يغذّي `private.is_org_member`، ويسمح لمستخدم بالانتماء لأكثر من مؤسسة |
| 2 | `Profile.pin` **حُذف** | المصادقة صارت Supabase Auth. رقم سري في جدول ليس مصادقة |
| 3 | `ProjectStatus` enum ← جدول `project_statuses` | الدليل يستخدم `projects.status_code`، والحالات تحتاج ترتيبًا وتسميات عربية داخل القاعدة |
| 4 | `QuotationVersion.items[]` (JSON) ← جدول `quotation_items` | التقارير والتجميع بـ SQL تحتاج صفوفًا لا مصفوفة |
| 5 | `Attachment.uri` + `uploaded` ← `storage_path` بلا علم رفع | الصف يُنشأ بعد نجاح الرفع فقط؛ ما قبل ذلك حالة على الجهاز لا في القاعدة |
| 6 | `Organization.vatPercent` حُذف | كان مكررًا مع `business_settings.vat_percent` — مصدر حقيقة واحد |
| 7 | `user_devices` أُضيف | مطلوب للـPush في `mobile.html`، وغائب عن الأنواع |
| 8 | `client_operations.result jsonb` أُضيف | إعادة الإرسال تُرجع النتيجة الأولى بدل إعادة التنفيذ |
| 9 | `InstallationChecklist` ← أربعة أعمدة boolean | أبسط للاستعلام من jsonb |
| 10 | `stock_movements.roll_id` | `sql.html` يكتبه `fabric_roll_id`؛ اعتُمدت تسمية الأنواع للاتساق |

## قرارات تستحق الانتباه

**المفاتيح الخارجية مركّبة.** كل علاقة تمرّ عبر `(organization_id, id)` لا عبر `id`
وحده. هذا يجعل تسريب صف بين مؤسستين مستحيلًا على مستوى المحرّك، لا على مستوى
السياسة فقط — دفاع ثانٍ لو أخطأت سياسة RLS يومًا.

**`on delete set null (column_list)` — يتطلب PostgreSQL 15+.** بدون قائمة الأعمدة
يحاول بوستجرس تصفير `organization_id` أيضًا فيصطدم بقيد `not null` عند أول حذف.
مشاريعك الحالية على 15 و17، فالشرط متحقق.

**لا عمود رصيد في أي مكان.** `fabric_rolls` تحمل `initial_meters` للتوثيق فقط.
الرصيد يُحسب دائمًا من `stock_movements` بنفس معادلة
[`domain/inventory.ts`](../expo/domain/inventory.ts).

**الأعمدة الحساسة موسومة.** كل عمود تكلفة أو ربح يحمل `comment` يبدأ بـ«حساس».
هذه ليست حماية — الحماية أن تغيب هذه الأعمدة عن views الأدوار العمياء. الوسم
يوجد ليجعل غيابها قابلًا للتدقيق آليًا في اختبارات pgTAP.

## النموذج الأمني

القراءة تمر عبر views في `api` موسومة `security_invoker`، فتنطبق سياسات RLS
بهوية المستخدم نفسه. أما الكتابة الحساسة — مال، مخزون، خصم، حالة رسمية — فلا
سياسة تسمح بها أصلًا: تمر عبر RPC موقّعة حصرًا.

**غياب سياسة `INSERT` على `stock_movements` أو `payments` ليس سهوًا — هو التصميم.**

| الجدول | القراءة | الكتابة من العميل |
|---|---|---|
| الزبائن، المشاريع، الغرف، الشبابيك | حسب الدور | ✅ للأدوار المخوّلة |
| الأقمشة والرولات | كل الأعضاء | الأدمن فقط |
| المخزون (حركة، حجز، استهلاك) | admin/sales + الخياط لمشاريعه | ❌ RPC حصرًا |
| العروض والبنود والخصومات | admin/sales | ❌ RPC حصرًا |
| الدفعات | admin/sales | ❌ RPC حصرًا |
| سجل التدقيق | الأدمن | ❌ أبدًا |

## التالي

1. **`0011_api_layer.sql`** — views بـ `security_invoker`، **بلا أعمدة تكلفة أو ربح لدورَي `field` و `tailor`**
2. **`0012_guard_triggers.sql`** — منع تعديل `status_code` من خارج RPC، ومنع UPDATE/DELETE على دفاتر الأستاذ، وتراجع مرحلة الخياط
3. **`api.reserve_fabric`** — أول RPC، بقفل `SELECT … FOR UPDATE` داخل transaction
4. **Storage** — أربعة buckets ومسارات تبدأ بـ `organization_id`
5. **البذرة** — حمادة، ساهر، أبو داني، مثقال + الرولات الأربعة
6. **pgTAP** — الاختبارات الثمانية في `security.html`

## التطبيق

الترحيلات مطبَّقة أصلًا على النسخة الحيّة. لتطبيق ترحيل **جديد**، الطريق المعتمد
هو SSH عبر paramiko ثم:

```bash
docker exec -i supabase-db-se3nf6ovhfq3qr3sjxzi9yba psql -U postgres -v ON_ERROR_STOP=1 --single-transaction
```

`ON_ERROR_STOP=1 --single-transaction` غير قابلة للتفاوض: بدونها يُطبَّق نصف
الملف ويُترك المخطط في حالة وسط.

بعد كل ترحيل، سجّل النسخة في الدفتر وإلا حاول `supabase db push` إعادة تشغيلها:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('<الطابع الزمني>', '<الاسم>') on conflict do nothing;
```
