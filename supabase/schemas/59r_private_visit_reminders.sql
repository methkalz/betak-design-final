-- ════════════════════════════════════════════════════════════════════
-- تذكير موعد الغد: مساء كلّ يوم بتوقيت المحلّ، لمن أُسندت إليه زيارة الغد
-- مرآة الترحيل 20261006120002_visit_reminders.sql - النصّ نفسه حرفيًّا.
-- ⚠️ الملكية ومهمّة pg_cron لا يلتقطها db diff — مكانها الترحيل.
-- ════════════════════════════════════════════════════════════════════

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
