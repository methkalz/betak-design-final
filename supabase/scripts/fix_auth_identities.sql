-- ════════════════════════════════════════════════════════════════════
-- إتمام حسابات الطاقم كي تقبلها خدمة الهوية (GoTrue)
--
-- درسٌ اصطاده الاختبار الحقيقي: الحساب المُدخَل يدويًا يبدو سليمًا في
-- القاعدة ويُخفق عند الدخول برسالة «Database error querying schema»،
-- لسببين لا يظهران في أي فحصٍ للبيانات:
--   ١) أعمدة الرموز النصية تقبل NULL في القاعدة، وقارئ GoTrue (بلغة Go)
--      يسكبها في نصٍّ لا يقبل NULL - فيعطب قبل أن يوقّع رمزًا.
--   ٢) لكل حساب يجب صفُّ هويةٍ في auth.identities لمزوّد البريد؛ غيابه
--      يمنع إصدار الجلسة.
-- كلاهما من صنع الإدخال المباشر، ولن يتكررا عند الإنشاء عبر واجهة Auth.
-- ════════════════════════════════════════════════════════════════════

begin;

update auth.users set
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
where email like '%@baytak.local';

-- عمود email مُولَّد من identity_data فلا يُدرَج مباشرة
insert into auth.identities
  (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email,
                          'email_verified', true, 'phone_verified', false),
       'email', now(), now()
from auth.users u
where u.email like '%@baytak.local'
  and not exists (select 1 from auth.identities i
                  where i.user_id = u.id and i.provider = 'email');

commit;

select 'users_fixed = ' || count(*) from auth.users
 where email like '%@baytak.local' and confirmation_token = '';
select 'identities = ' || count(*) from auth.identities;
