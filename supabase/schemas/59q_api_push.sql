-- ════════════════════════════════════════════════════════════════════
-- إشعارات الهاتف: تسجيل الجهاز، والإرسال على كلّ إشعار، ومتابعة النتائج
-- مرآة الترحيل 20261006120001_push_notifications.sql - النصّ نفسه حرفيًّا.
-- ⚠️ الملكية والمنح ومهمّة pg_cron لا يلتقطها db diff — مكانها الترحيل.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.register_device(p_token text, p_platform text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_token text := btrim(coalesce(p_token, ''));
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  -- رمز Expo بصيغته المعروفة وحدها: نصٌّ آخر لن يصل إليه شيء، وقبوله يملأ
  -- السجلّ برسائل فاشلة
  if v_token !~ '^Expo(nent)?PushToken\[[^]]+\]$' then
    raise exception 'رمز إشعارات غير صالح.' using errcode = 'BD400';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'المنصّة يجب أن تكون ios أو android.' using errcode = 'BD400';
  end if;

  v_org := private.current_org();
  if v_org is null then
    raise exception 'لست عضوًا فاعلًا في أيّ مؤسسة.' using errcode = 'BD403';
  end if;

  -- الجهاز لآخر من دخل منه: من خرج من هذا الهاتف لا يستلم عليه بعد الآن
  delete from core.user_devices d
  where d.expo_push_token = v_token and d.user_id <> v_uid;

  insert into core.user_devices (organization_id, user_id, expo_push_token, platform, last_seen_at)
  values (v_org, v_uid, v_token, p_platform, now())
  on conflict (user_id, expo_push_token) do update
    set last_seen_at = now(),
        platform = excluded.platform,
        organization_id = excluded.organization_id;

  return jsonb_build_object('registered', true, 'platform', p_platform);
end
$function$;

CREATE OR REPLACE FUNCTION api.unregister_device(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_n integer;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  -- يُستدعى عند الخروج: جهازه هو وحده، فلا يُلغي أحدٌ جهاز غيره
  delete from core.user_devices d
  where d.user_id = v_uid and d.expo_push_token = btrim(coalesce(p_token, ''));
  get diagnostics v_n = row_count;
  return jsonb_build_object('removed', v_n);
end
$function$;

CREATE OR REPLACE FUNCTION private.try_jsonb(p_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
begin
  return p_text::jsonb;
exception when others then
  return null;
end
$function$;

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

CREATE OR REPLACE FUNCTION private.apply_push_ticket(p_delivery_id bigint, p_status_code integer, p_timed_out boolean, p_error_msg text, p_content text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_d core.push_deliveries%rowtype; v_body jsonb; v_ticket jsonb; v_err text;
begin
  select * into v_d from core.push_deliveries
  where id = p_delivery_id and status = 'queued'
  for update;
  if not found then
    return null;
  end if;

  -- ردّ Expo مصفوفةُ تذاكر بترتيب الرسائل نفسه
  v_body := private.try_jsonb(p_content);
  v_ticket := v_body -> 'data' -> v_d.msg_index;
  if v_ticket ->> 'status' = 'ok' then
    update core.push_deliveries
    set status = 'sent', ticket_id = v_ticket ->> 'id', updated_at = now()
    where id = v_d.id;
    return 'sent';
  end if;

  v_err := coalesce(
    v_ticket #>> '{details,error}',
    v_ticket ->> 'message',
    v_body -> 'errors' -> 0 ->> 'code',
    p_error_msg,
    case when p_timed_out then 'timeout' end,
    'http_' || coalesce(p_status_code::text, '?'));
  update core.push_deliveries
  set status = 'failed', error = v_err, updated_at = now()
  where id = v_d.id;
  -- إرسالٌ مكرّر إلى جهازٍ ميت مخالفٌ لشروط Expo: يُحذف حتى يعود صاحبه فيسجّله
  if v_err = 'DeviceNotRegistered' then
    delete from core.user_devices where expo_push_token = v_d.expo_push_token;
  end if;
  return 'failed';
end
$function$;

CREATE OR REPLACE FUNCTION private.apply_push_receipt(p_delivery_id bigint, p_content text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_d core.push_deliveries%rowtype; v_receipt jsonb; v_err text;
begin
  select * into v_d from core.push_deliveries
  where id = p_delivery_id and status = 'sent'
  for update;
  if not found then
    return null;
  end if;

  -- ردّ الإيصالات كائنٌ مفاتيحه أرقام التذاكر
  v_receipt := private.try_jsonb(p_content) -> 'data' -> v_d.ticket_id;
  if v_receipt is null then
    -- لا إيصال بعد: يُسأل مرّةً أخرى بعد ربع ساعة
    update core.push_deliveries set receipt_request_id = null, updated_at = now() where id = v_d.id;
    return 'sent';
  elsif v_receipt ->> 'status' = 'ok' then
    update core.push_deliveries set status = 'delivered', updated_at = now() where id = v_d.id;
    return 'delivered';
  end if;

  v_err := coalesce(v_receipt #>> '{details,error}', v_receipt ->> 'message', 'receipt_error');
  update core.push_deliveries set status = 'failed', error = v_err, updated_at = now() where id = v_d.id;
  if v_err = 'DeviceNotRegistered' then
    delete from core.user_devices where expo_push_token = v_d.expo_push_token;
  end if;
  return 'failed';
end
$function$;

CREATE OR REPLACE FUNCTION private.process_push_results()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record; v_ids text[]; v_req bigint;
  v_tickets integer := 0; v_receipts integer := 0;
begin
  -- ١) التذاكر: ما ردّت به Expo على طلبات الإرسال
  for r in
    select d.id, resp.status_code, resp.timed_out, resp.error_msg, resp.content
    from core.push_deliveries d
    join net._http_response resp on resp.id = d.request_id
    where d.status = 'queued'
  loop
    perform private.apply_push_ticket(r.id, r.status_code, r.timed_out, r.error_msg, r.content);
    v_tickets := v_tickets + 1;
  end loop;

  -- طلبٌ لم يعد له ردّ (انتهت صلاحية ردود pg_net أو تعطّل العامل)
  update core.push_deliveries
  set status = 'failed', error = 'no_response', updated_at = now()
  where status = 'queued' and request_id is not null
    and updated_at < now() - interval '1 hour';

  -- ٢) الإيصالات: هل سلّمت Apple/Google فعلًا؟
  for r in
    select d.id, d.updated_at, resp.id as resp_id, resp.content
    from core.push_deliveries d
    left join net._http_response resp on resp.id = d.receipt_request_id
    where d.status = 'sent' and d.receipt_request_id is not null
  loop
    if r.resp_id is not null then
      perform private.apply_push_receipt(r.id, r.content);
    elsif r.updated_at < now() - interval '1 hour' then
      -- طلب الإيصال ضاع: يُعاد
      update core.push_deliveries set receipt_request_id = null, updated_at = now() where id = r.id;
    end if;
  end loop;

  -- طلب إيصالاتٍ جديدة دفعةً واحدة: ربع ساعة بعد التذكرة كما توصي Expo،
  -- وحتى ألف تذكرة في الطلب. ما لم يُجِب خلال يوم يبقى «sent».
  select array_agg(s.ticket_id) into v_ids
  from (
    select d.ticket_id
    from core.push_deliveries d
    where d.status = 'sent' and d.receipt_request_id is null and d.ticket_id is not null
      and d.updated_at < now() - interval '15 minutes'
      and d.created_at > now() - interval '1 day'
    order by d.id
    limit 1000
  ) s;
  if v_ids is not null then
    v_req := net.http_post(
      url := 'https://exp.host/--/api/v2/push/getReceipts',
      body := jsonb_build_object('ids', to_jsonb(v_ids)),
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
      timeout_milliseconds := 10000);
    update core.push_deliveries
    set receipt_request_id = v_req, updated_at = now()
    where status = 'sent' and ticket_id = any (v_ids);
    v_receipts := array_length(v_ids, 1);
  end if;

  -- ٣) التنظيف: ثلاثون يومًا تكفي للتشخيص
  delete from core.push_deliveries where created_at < now() - interval '30 days';

  return jsonb_build_object('tickets', v_tickets, 'receipts_requested', v_receipts);
end
$function$;

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
