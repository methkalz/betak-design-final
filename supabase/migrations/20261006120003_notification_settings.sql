-- ════════════════════════════════════════════════════════════════════
-- إعدادات الإشعارات: لكلّ مستخدم أنواعٌ يُطفئها على هاتفه، وللأدمن تذكير الغد
--
-- ١) المستخدم يُطفئ نوعًا على هاتفه (تنبيهات المخزون مثلًا): الإشعار يبقى
--    في قائمة التطبيق كما هو، والهاتف وحده لا يرنّ له. لا يُحذف إشعارٌ ولا
--    يُخفى - من أطفأ نوعًا ثم احتاجه يجده في القائمة.
-- ٢) الأدمن يحدّد ساعة تذكير موعد الغد (بدل السادسة الثابتة) أو يوقفه
--    للمحلّ كلّه. النافذة تبقى «من الساعة المختارة حتى منتصف الليل».
--
-- لماذا جدولٌ مستقلّ لا عمودٌ في profiles: الزملاء يقرؤون profiles (سياسة
-- members read colleagues)، وتفضيلات المرء ليست شأنهم. وصفٌّ واحد لكلّ
-- مستخدم بمصفوفة الأنواع المُطفأة: الافتراض «كلّ شيءٍ يرنّ» بلا صفّ أصلًا.
-- ════════════════════════════════════════════════════════════════════

-- ── ١) تذكير الغد في إعدادات المحلّ ──────────────────────────────────

alter table core.business_settings
  add column if not exists visit_reminder_enabled boolean DEFAULT true NOT NULL;
alter table core.business_settings
  add column if not exists visit_reminder_hour smallint DEFAULT 18 NOT NULL;
alter table core.business_settings
  add constraint business_settings_visit_reminder_hour_check CHECK (((visit_reminder_hour >= 0) AND (visit_reminder_hour <= 23)));

-- ── ٢) الأنواع المُطفأة لكلّ مستخدم ──────────────────────────────────

create table if not exists core.notification_prefs (
    user_id uuid NOT NULL,
    muted_kinds core.notification_kind[] DEFAULT '{}'::core.notification_kind[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- المالك postgres صراحةً: المحفّز يملكه postgres ويقرأ من هنا
alter table core.notification_prefs owner to postgres;

ALTER TABLE ONLY core.notification_prefs
    ADD CONSTRAINT notification_prefs_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY core.notification_prefs
    ADD CONSTRAINT notification_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.profiles(id) ON DELETE CASCADE;

-- لا سياسة ولا منح: الدوال وحدها تقرأ وتكتب
ALTER TABLE core.notification_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.notification_prefs FORCE ROW LEVEL SECURITY;
revoke all on core.notification_prefs from public, anon, authenticated;

COMMENT ON TABLE core.notification_prefs IS 'أنواع الإشعارات التي أطفأها المستخدم على هاتفه. الإشعار يبقى في قائمة التطبيق؛ الهاتف وحده لا يرنّ. لا صفّ = كلّ شيءٍ يرنّ.';

-- ── ٣) سطح الإعدادات ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION api.notification_settings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_role core.app_role; v_muted core.notification_kind[];
  v_enabled boolean; v_hour smallint;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;

  v_org := private.current_org();
  if v_org is null then
    raise exception 'لست عضوًا فاعلًا في أيّ مؤسسة.' using errcode = 'BD403';
  end if;
  v_role := private.role_in(v_org);

  select np.muted_kinds into v_muted from core.notification_prefs np where np.user_id = v_uid;
  select bs.visit_reminder_enabled, bs.visit_reminder_hour into v_enabled, v_hour
  from core.business_settings bs where bs.organization_id = v_org;

  return jsonb_build_object(
    'role', v_role,
    'muted_kinds', to_jsonb(coalesce(v_muted, '{}'::core.notification_kind[])),
    'visit_reminder_enabled', coalesce(v_enabled, true),
    'visit_reminder_hour', coalesce(v_hour, 18),
    'can_manage_reminders', private.is_admin(v_org));
end
$function$;

CREATE OR REPLACE FUNCTION api.set_muted_notification_kinds(p_kinds text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_bad text; v_muted core.notification_kind[];
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;

  -- نوعٌ غير معروف يُرفض باسمه، لا بخطأ تحويلٍ غامض
  select k into v_bad
  from unnest(coalesce(p_kinds, '{}'::text[])) as k
  where not exists (
    select 1 from pg_catalog.pg_enum e
    where e.enumtypid = 'core.notification_kind'::regtype and e.enumlabel = k)
  limit 1;
  if v_bad is not null then
    raise exception 'نوع إشعار غير معروف: %', v_bad using errcode = 'BD400';
  end if;

  select coalesce(array_agg(distinct k::core.notification_kind order by k::core.notification_kind),
                  '{}'::core.notification_kind[])
  into v_muted
  from unnest(coalesce(p_kinds, '{}'::text[])) as k;

  insert into core.notification_prefs (user_id, muted_kinds, updated_at)
  values (v_uid, v_muted, now())
  on conflict (user_id) do update
    set muted_kinds = excluded.muted_kinds, updated_at = now();

  return jsonb_build_object('muted_kinds', to_jsonb(v_muted));
end
$function$;

CREATE OR REPLACE FUNCTION api.set_visit_reminder(p_enabled boolean, p_hour integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;

  v_org := private.current_org();
  if v_org is null or not private.is_admin(v_org) then
    raise exception 'إعداد تذكير المواعيد للأدمن وحده.' using errcode = 'BD403';
  end if;
  if p_enabled is null or p_hour is null or p_hour < 0 or p_hour > 23 then
    raise exception 'الساعة بين 0 و23، والتفعيل نعم أو لا.' using errcode = 'BD400';
  end if;

  update core.business_settings
  set visit_reminder_enabled = p_enabled, visit_reminder_hour = p_hour
  where organization_id = v_org;

  insert into core.audit_logs (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'settings.visit_reminder', 'business_settings', v_org::text,
          case when p_enabled then format('تذكير موعد الغد: الساعة %s', p_hour)
               else 'تذكير موعد الغد: متوقّف' end,
          jsonb_build_object('enabled', p_enabled, 'hour', p_hour));

  return jsonb_build_object('visit_reminder_enabled', p_enabled, 'visit_reminder_hour', p_hour);
end
$function$;

-- ── ٤) الإرسال يحترم ما أطفأه المستخدم ──────────────────────────────

CREATE OR REPLACE FUNCTION private.push_on_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tokens text[]; v_badge integer; v_messages jsonb; v_request bigint; v_dry boolean;
begin
  -- الفاعل لا يُنبَّه بفعله: نتيجته أمامه على الشاشة
  if new.user_id = private.current_uid() then
    return new;
  end if;

  begin
    -- من أطفأ هذا النوع على هاتفه لا يرنّ له - والإشعار في القائمة باقٍ
    if exists (
      select 1 from core.notification_prefs np
      where np.user_id = new.user_id and new.kind = any (np.muted_kinds)) then
      return new;
    end if;

    select array_agg(d.expo_push_token order by d.expo_push_token) into v_tokens
    from core.user_devices d
    where d.user_id = new.user_id and d.platform in ('ios', 'android');
    if v_tokens is null then
      return new;
    end if;

    -- رقم الأيقونة = غير المقروء كلّه، بما فيه هذا الإشعار
    select count(*) into v_badge
    from core.notifications n
    where n.user_id = new.user_id and n.read_at is null;

    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'to', u.t,
             'title', new.title,
             'body', nullif(btrim(new.body), ''),
             'sound', 'default',
             'priority', 'high',
             'channelId', 'default',
             'badge', v_badge,
             'data', jsonb_build_object(
               'notification_id', new.id,
               'kind', new.kind,
               'deep_link', new.deep_link)))
           order by u.i)
    into v_messages
    from unnest(v_tokens) with ordinality as u(t, i);

    v_dry := coalesce(current_setting('app.push_dry_run', true), '') = 'on';
    if not v_dry then
      v_request := net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := v_messages,
        headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
        timeout_milliseconds := 10000);
    end if;

    insert into core.push_deliveries
      (organization_id, notification_id, user_id, expo_push_token, msg_index, request_id, status)
    select new.organization_id, new.id, new.user_id, u.t, (u.i - 1)::integer, v_request,
           case when v_dry then 'dry_run' else 'queued' end
    from unnest(v_tokens) with ordinality as u(t, i);
  exception when others then
    -- الإشعار لا يُسقط العملية التجارية أبدًا
    raise warning 'push: تعذّر وضع الإشعار % في الطابور: %', new.id, sqlerrm;
  end;
  return new;
end
$function$;

-- ── ٥) التذكير يقرأ ساعته وتفعيله من إعدادات المحلّ ────────────────

CREATE OR REPLACE FUNCTION private.send_visit_reminders(p_now timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_n integer;
begin
  -- المحلّات التي تُذكِّر الآن: منطقتها صالحة (تُفحص مرّةً لكلّ محلّ لا لكلّ
  -- زيارة)، والتذكير مفعّل، والساعة بين ما اختاره الأدمن ومنتصف الليل
  with shops as (
    select bs.organization_id, bs.timezone,
           (p_now at time zone bs.timezone) as local_now
    from core.business_settings bs
    where bs.visit_reminder_enabled
      and bs.timezone in (select tz.name from pg_catalog.pg_timezone_names tz)
  )
  insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
  select v.organization_id, v.assignee_id, 'appointment_tomorrow',
         case v.type when 'measurement' then 'تذكير: زيارة قياس غدًا' else 'تذكير: تركيب غدًا' end,
         concat_ws(' · ',
           p.title,
           'الساعة ' || to_char(v.scheduled_at at time zone s.timezone, 'HH24:MI'),
           nullif(btrim(c.city), '')),
         '/visit/' || v.id::text
  from core.field_visits v
  join shops s on s.organization_id = v.organization_id
  join core.business_settings bs on bs.organization_id = v.organization_id
  join core.projects p on p.id = v.project_id
  left join core.customers c on c.id = p.customer_id
  join core.organization_members om
    on om.organization_id = v.organization_id and om.user_id = v.assignee_id and om.is_active
  where v.status = 'scheduled'
    and v.scheduled_at is not null
    and p.archived_at is null
    and extract(hour from s.local_now) between bs.visit_reminder_hour and 23
    and (v.scheduled_at at time zone s.timezone)::date = s.local_now::date + 1
    -- مرّةً في اليوم لا مرّةً في 36 ساعة: موعدٌ ذُكِّر به ثم نُقل إلى ما
    -- بعد الغد يُذكَّر به من جديد مساء اليوم السابق لموعده الجديد
    and not exists (
      select 1 from core.notifications n
      where n.user_id = v.assignee_id
        and n.kind = 'appointment_tomorrow'
        and n.deep_link = '/visit/' || v.id::text
        and n.created_at >= (date_trunc('day', s.local_now) at time zone s.timezone));
  get diagnostics v_n = row_count;
  return v_n;
end
$function$;

-- ── ٦) الملكية والمنح ────────────────────────────────────────────────

-- الدوال الثلاث تقرأ الأعضاء والإعدادات وتكتب التفضيلات والتدقيق بمالك الـAPI
grant select, insert, update on core.notification_prefs to baytak_rpc_owner;

grant create on schema api to baytak_rpc_owner;
alter function api.notification_settings() owner to baytak_rpc_owner;
alter function api.set_muted_notification_kinds(text[]) owner to baytak_rpc_owner;
alter function api.set_visit_reminder(boolean, integer) owner to baytak_rpc_owner;
revoke create on schema api from baytak_rpc_owner;
revoke all on function api.notification_settings() from public, anon;
revoke all on function api.set_muted_notification_kinds(text[]) from public, anon;
revoke all on function api.set_visit_reminder(boolean, integer) from public, anon;
grant execute on function api.notification_settings() to authenticated;
grant execute on function api.set_muted_notification_kinds(text[]) to authenticated;
grant execute on function api.set_visit_reminder(boolean, integer) to authenticated;

-- CREATE OR REPLACE يحفظ ملكية الدالّتين ومنحهما من ترحيلَيهما
notify pgrst, 'reload schema';
