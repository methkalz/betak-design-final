-- ════════════════════════════════════════════════════════════════════
-- إشعارات الهاتف: من صفّ core.notifications إلى شاشة الجوّال
--
-- قبل هذا الترحيل كان الإشعار يُكتب في القاعدة ويبقى فيها: لا يراه صاحبه
-- إلا حين يفتح التطبيق. جدول user_devices كان موجودًا بلا كاتبٍ ولا قارئ.
--
-- الطريق كاملًا داخل القاعدة، بلا خادمٍ وسيط:
--   ١) التطبيق يسجّل رمز Expo للجهاز بـ api.register_device بعد الدخول.
--   ٢) محفّز AFTER INSERT على core.notifications يبني رسالةً لكلّ جهازٍ
--      لصاحب الإشعار، ويضعها في طابور pg_net. الطابور جدولٌ عاديّ يخضع
--      للمعاملة: إن تراجعت العملية التجارية تراجع الإرسال معها، فلا يصل
--      إشعارٌ عن شيءٍ لم يحدث. والإرسال الفعليّ يجري بعد الالتزام.
--   ٣) مهمّة pg_cron كلّ دقيقة تقرأ ردود Expo: التذكرة أوّلًا، ثم الإيصال
--      بعد ربع ساعة (هل سلّمت Apple/Google فعلًا؟). الجهاز الذي يُبلَّغ عنه
--      DeviceNotRegistered يُحذف - إرسالٌ مكرّر إليه مخالفٌ لشروط Expo.
--
-- ثلاث قواعد لا تُكسر:
--   • الإشعار لا يُسقط عمليةً تجارية أبدًا: كلّ ما يخصّ الإرسال داخل كتلة
--     استثناء تكتفي بتحذير. خياطٌ لم يصله إشعار أهون من دفعةٍ لم تُسجَّل.
--   • الفاعل لا يُنبَّه بفعله: الأدمن الذي يستلم رولًا يرى ذلك على شاشته؛
--     الإشعار داخل التطبيق يبقى كما كان، والهاتف لا يرنّ له.
--   • الجهاز لآخر من دخل منه: هاتفٌ تبدّل عليه مستخدمان لا يستلم إشعارات
--     من خرج.
--
-- app.push_dry_run = 'on' يسجّل التسليم بلا إرسال - للاختبارات وحدها.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;

-- ── ١) سجلّ التسليم ─────────────────────────────────────────────────

create table if not exists core.push_deliveries (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    organization_id uuid NOT NULL,
    notification_id uuid NOT NULL,
    user_id uuid NOT NULL,
    expo_push_token text NOT NULL,
    msg_index integer NOT NULL,
    request_id bigint,
    ticket_id text,
    status text DEFAULT 'queued'::text NOT NULL,
    error text,
    receipt_request_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT push_deliveries_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'dry_run'::text])))
);

ALTER TABLE ONLY core.push_deliveries
    ADD CONSTRAINT push_deliveries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.push_deliveries
    ADD CONSTRAINT push_deliveries_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES core.notifications(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.push_deliveries
    ADD CONSTRAINT push_deliveries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;

CREATE INDEX push_deliveries_pending_idx ON core.push_deliveries USING btree (status, updated_at) WHERE (status = ANY (ARRAY['queued'::text, 'sent'::text]));
CREATE INDEX push_deliveries_request_idx ON core.push_deliveries USING btree (request_id);
CREATE INDEX push_deliveries_receipt_idx ON core.push_deliveries USING btree (receipt_request_id) WHERE (receipt_request_id IS NOT NULL);

-- لا سياسة ولا منح: يقرؤه ويكتبه المحفّز والمهمّة الدورية وحدهما
ALTER TABLE core.push_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.push_deliveries FORCE ROW LEVEL SECURITY;
revoke all on core.push_deliveries from public, anon, authenticated;

COMMENT ON TABLE core.push_deliveries IS 'سجلّ تسليم إشعارات الهاتف: رسالةٌ لكلّ (إشعار × جهاز). queued في طابور pg_net، sent بتذكرة Expo، delivered بإيصال Apple/Google، failed مع السبب. يُنظَّف بعد ثلاثين يومًا.';

-- ── ٢) تسجيل الجهاز وإلغاؤه ──────────────────────────────────────────

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

  select om.organization_id into v_org
  from core.organization_members om
  where om.user_id = v_uid and om.is_active
  order by om.organization_id
  limit 1;
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

-- ── ٣) الإرسال: محفّز على كلّ إشعار ─────────────────────────────────

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

-- ── ٤) النتائج: تذاكر، ثم إيصالات، ثم تنظيف ─────────────────────────

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

CREATE TRIGGER notifications_push AFTER INSERT ON core.notifications FOR EACH ROW EXECUTE FUNCTION private.push_on_notification();

-- ── ٥) الملكية والمنح ────────────────────────────────────────────────

-- المحفّز والمهمّة يملكهما postgres: يتجاوز RLS، وعضوٌ في
-- supabase_functions_admin فيملك net.http_post وقراءة ردوده
alter function private.try_jsonb(text) owner to postgres;
alter function private.push_on_notification() owner to postgres;
alter function private.apply_push_ticket(bigint, integer, boolean, text, text) owner to postgres;
alter function private.apply_push_receipt(bigint, text) owner to postgres;
alter function private.process_push_results() owner to postgres;
revoke all on function private.try_jsonb(text) from public, anon, authenticated;
revoke all on function private.apply_push_ticket(bigint, integer, boolean, text, text) from public, anon, authenticated;
revoke all on function private.apply_push_receipt(bigint, text) from public, anon, authenticated;
revoke all on function private.push_on_notification() from public, anon, authenticated;
revoke all on function private.process_push_results() from public, anon, authenticated;

-- دالّتا الجهاز تعملان بمالك الـAPI، وهو بلا صلاحيةٍ على الأجهزة قبل الآن
grant select, insert, update, delete on core.user_devices to baytak_rpc_owner;

grant create on schema api to baytak_rpc_owner;
alter function api.register_device(text, text) owner to baytak_rpc_owner;
alter function api.unregister_device(text) owner to baytak_rpc_owner;
revoke create on schema api from baytak_rpc_owner;
revoke all on function api.register_device(text, text) from public, anon;
revoke all on function api.unregister_device(text) from public, anon;
grant execute on function api.register_device(text, text) to authenticated;
grant execute on function api.unregister_device(text) to authenticated;

-- ── ٦) المهمّة الدورية ───────────────────────────────────────────────

-- cron.schedule باسمٍ موجود يحدّثه لا يكرّره
select cron.schedule('baytak-push-results', '* * * * *', 'select private.process_push_results()');

notify pgrst, 'reload schema';
