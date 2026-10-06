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
  insert into core.notifications (organization_id, user_id, kind, title, body, deep_link)
  select v.organization_id, v.assignee_id, 'appointment_tomorrow',
         case v.type when 'measurement' then 'تذكير: زيارة قياس غدًا' else 'تذكير: تركيب غدًا' end,
         concat_ws(' · ',
           p.title,
           'الساعة ' || to_char(v.scheduled_at at time zone bs.timezone, 'HH24:MI'),
           nullif(btrim(c.city), '')),
         '/visit/' || v.id::text
  from core.field_visits v
  join core.business_settings bs on bs.organization_id = v.organization_id
  join core.projects p on p.id = v.project_id
  left join core.customers c on c.id = p.customer_id
  join core.organization_members om
    on om.organization_id = v.organization_id and om.user_id = v.assignee_id and om.is_active
  where v.status = 'scheduled'
    and v.scheduled_at is not null
    and p.archived_at is null
    and exists (select 1 from pg_catalog.pg_timezone_names tz where tz.name = bs.timezone)
    and extract(hour from (p_now at time zone bs.timezone)) between 18 and 23
    and (v.scheduled_at at time zone bs.timezone)::date = (p_now at time zone bs.timezone)::date + 1
    and not exists (
      select 1 from core.notifications n
      where n.user_id = v.assignee_id
        and n.kind = 'appointment_tomorrow'
        and n.deep_link = '/visit/' || v.id::text
        and n.created_at > p_now - interval '36 hours');
  get diagnostics v_n = row_count;
  return v_n;
end
$function$;
