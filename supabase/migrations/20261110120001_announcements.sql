-- ════════════════════════════════════════════════════════════════════
-- الإشعار العامّ: رسالةٌ من الأدمن إلى الطاقم كلّه أو إلى أدوارٍ منه
--
-- الطريق كلّه موجود: كلّ صفّ في core.notifications يصل هاتف صاحبه عبر
-- محفّز notifications_push. فالإشعار العامّ صفٌّ لكلّ مستلم، من نوعٍ جديد
-- 'announcement'، مربوطٌ بسجلٍّ واحد في core.announcements يحفظ من أرسل
-- وماذا ولمن - ومنه يُحسب كم وصل فعلًا.
--
-- القواعد:
--   • الأدمن وحده يرسل، والخادم يرفض غيره مهما أرسلت الشاشة.
--   • لا يُطفأ: رسالة الإدارة للجميع (إغلاق، مواعيد). المحفّز يتجاهل
--     الإطفاء لهذا النوع، ودالّة الإطفاء ترفضه.
--   • المستلمون: الأعضاء الفاعلون في الأدوار المختارة (أو الجميع)، عدا
--     المرسل نفسه - كتبه بيده.
--   • مرّةً واحدة: مفتاح idempotency كبقية العمليات، فالضغطتان لا ترسلان
--     رسالتين.
-- ════════════════════════════════════════════════════════════════════

alter type core.notification_kind add value if not exists 'announcement';

-- ── ١) سجلّ الإشعارات العامة ─────────────────────────────────────────

create table if not exists core.announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    title text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    roles core.app_role[],
    recipients integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT announcements_title_check CHECK (((length(btrim(title)) >= 2) AND (length(title) <= 80))),
    CONSTRAINT announcements_body_check CHECK ((length(body) <= 500))
);

alter table core.announcements owner to postgres;

ALTER TABLE ONLY core.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);
ALTER TABLE ONLY core.announcements
    ADD CONSTRAINT announcements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY core.announcements
    ADD CONSTRAINT announcements_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES core.profiles(id);

CREATE INDEX announcements_org_created_idx ON core.announcements USING btree (organization_id, created_at DESC);

-- لا سياسة ولا منح: الدوال وحدها تقرأ وتكتب
ALTER TABLE core.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.announcements FORCE ROW LEVEL SECURITY;
revoke all on core.announcements from public, anon, authenticated;

COMMENT ON TABLE core.announcements IS 'الإشعارات العامة التي أرسلها الأدمن: من، وماذا، ولأيّ أدوار، وكم مستلمًا. صفوف المستلمين في core.notifications مربوطة بـ announcement_id.';

-- كلّ صفّ مستلمٍ يعرف إشعاره العامّ، فيُحسب منه ما وصل
alter table core.notifications
  add column if not exists announcement_id uuid;
ALTER TABLE ONLY core.notifications
    ADD CONSTRAINT notifications_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES core.announcements(id) ON DELETE CASCADE;
CREATE INDEX notifications_announcement_idx ON core.notifications USING btree (announcement_id) WHERE (announcement_id IS NOT NULL);

-- ── ٢) الإرسال ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION api.send_announcement(p_title text, p_body text, p_roles text[], p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_title text; v_body text; v_roles core.app_role[];
  v_bad text; v_id uuid; v_n integer;
  v_payload jsonb; v_prior core.client_operations%rowtype; v_result jsonb;
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key إلزامي.' using errcode = 'BD400';
  end if;

  v_org := private.current_org();
  if v_org is null or not private.is_admin(v_org) then
    raise exception 'الإشعار العامّ للأدمن وحده.' using errcode = 'BD403';
  end if;

  v_title := btrim(coalesce(p_title, ''));
  v_body := btrim(coalesce(p_body, ''));
  if length(v_title) < 2 or length(v_title) > 80 then
    raise exception 'العنوان بين حرفين و80 حرفًا.' using errcode = 'BD400';
  end if;
  if length(v_body) > 500 then
    raise exception 'النصّ 500 حرف على الأكثر.' using errcode = 'BD400';
  end if;

  -- لا أدوار = الجميع. ودورٌ غير معروف يُرفض باسمه
  select r into v_bad
  from unnest(coalesce(p_roles, '{}'::text[])) as r
  where not exists (
    select 1 from pg_catalog.pg_enum e
    where e.enumtypid = 'core.app_role'::regtype and e.enumlabel = r)
  limit 1;
  if v_bad is not null then
    raise exception 'دور غير معروف: %', v_bad using errcode = 'BD400';
  end if;
  if coalesce(array_length(p_roles, 1), 0) > 0 then
    select array_agg(distinct r::core.app_role order by r::core.app_role) into v_roles
    from unnest(p_roles) as r;
  end if;

  v_payload := jsonb_build_object(
    'op', 'send_announcement', 'user_id', v_uid, 'title', v_title, 'body', v_body,
    'roles', to_jsonb(v_roles));

  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    if v_prior.payload is distinct from v_payload then
      raise exception 'مفتاح idempotency مستخدم سابقًا بمدخلات مختلفة.' using errcode = 'BD409';
    end if;
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  -- قفلٌ على المفتاح: ضغطتان متزامنتان لا ترسلان رسالتين
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('baytak:announce:' || p_idempotency_key::text, 0));
  select * into v_prior from core.client_operations o
  where o.organization_id = v_org and o.idempotency_key = p_idempotency_key;
  if found then
    return v_prior.result || jsonb_build_object('was_replayed', true);
  end if;

  select count(*) into v_n
  from core.organization_members om
  where om.organization_id = v_org and om.is_active and om.user_id <> v_uid
    and (v_roles is null or om.role = any (v_roles));
  if v_n = 0 then
    raise exception 'لا يوجد مستلمون فاعلون في الأدوار المختارة.' using errcode = 'BD422';
  end if;

  insert into core.announcements (organization_id, sender_id, title, body, roles, recipients)
  values (v_org, v_uid, v_title, v_body, v_roles, v_n)
  returning id into v_id;

  -- صفٌّ لكلّ مستلم: المحفّز يوصله إلى هاتفه، والقائمة تحفظه
  insert into core.notifications (organization_id, user_id, kind, title, body, deep_link, announcement_id)
  select v_org, om.user_id, 'announcement', v_title, v_body, '/notifications', v_id
  from core.organization_members om
  where om.organization_id = v_org and om.is_active and om.user_id <> v_uid
    and (v_roles is null or om.role = any (v_roles));

  insert into core.audit_logs (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'notification.announcement', 'announcement', v_id::text,
          format('إشعار عامّ إلى %s: %s', v_n, v_title), v_payload);

  v_result := jsonb_build_object('announcement_id', v_id, 'recipients', v_n, 'was_replayed', false);

  insert into core.client_operations
    (organization_id, user_id, client_operation_id, idempotency_key,
     kind, entity_id, state, payload, result, synced_at)
  values (v_org, v_uid, p_idempotency_key, p_idempotency_key,
          'send_announcement', v_id::text, 'synced', v_payload, v_result, now());

  return v_result;
end
$function$;

CREATE OR REPLACE FUNCTION api.recent_announcements()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if private.current_uid() is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  v_org := private.current_org();
  if v_org is null or not private.is_admin(v_org) then
    raise exception 'سجلّ الإشعارات العامة للأدمن وحده.' using errcode = 'BD403';
  end if;

  -- آخر عشرين، ولكلٍّ منها: كم مستلمًا، وكم قرأه، وكم هاتفًا سلّمته Apple/Google
  return coalesce((
    select jsonb_agg(row_to_json(t) order by t.created_at desc)
    from (
      select a.id, a.title, a.body, a.roles, a.recipients, a.created_at,
             p.full_name as sender_name,
             (select count(*) from core.notifications n
              where n.announcement_id = a.id and n.read_at is not null) as read_count,
             (select count(*) from core.push_deliveries d
              join core.notifications n on n.id = d.notification_id
              where n.announcement_id = a.id and d.status in ('sent', 'delivered')) as pushed,
             (select count(*) from core.push_deliveries d
              join core.notifications n on n.id = d.notification_id
              where n.announcement_id = a.id and d.status = 'delivered') as delivered
      from core.announcements a
      left join core.profiles p on p.id = a.sender_id
      where a.organization_id = v_org
      order by a.created_at desc
      limit 20
    ) t), '[]'::jsonb);
end
$function$;

-- ── ٣) الإشعار العامّ لا يُطفأ ────────────────────────────────────────

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
    -- من أطفأ هذا النوع على هاتفه لا يرنّ له - والإشعار في القائمة باقٍ.
    -- إلا الإشعار العامّ: رسالة الإدارة للجميع لا تُطفأ
    if new.kind::text <> 'announcement' and exists (
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
  -- الإشعار العامّ لا يُطفأ: رسالة الإدارة تصل الجميع
  if 'announcement' = any (coalesce(p_kinds, '{}'::text[])) then
    raise exception 'الإشعارات العامة لا يمكن إطفاؤها.' using errcode = 'BD400';
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

-- ── ٤) الملكية والمنح ────────────────────────────────────────────────

-- دالّتا الإشعار العامّ بمالك الـAPI: تكتبان السجلّ وتقرآن التسليم
grant select, insert on core.announcements to baytak_rpc_owner;
grant select on core.push_deliveries to baytak_rpc_owner;
-- السجلّ يعدّ القراءة من صفوف المستلمين، ومالك الـAPI يكتبها ولا يقرؤها قبل الآن
grant select on core.notifications to baytak_rpc_owner;

grant create on schema api to baytak_rpc_owner;
alter function api.send_announcement(text, text, text[], uuid) owner to baytak_rpc_owner;
alter function api.recent_announcements() owner to baytak_rpc_owner;
revoke create on schema api from baytak_rpc_owner;
revoke all on function api.send_announcement(text, text, text[], uuid) from public, anon;
revoke all on function api.recent_announcements() from public, anon;
grant execute on function api.send_announcement(text, text, text[], uuid) to authenticated;
grant execute on function api.recent_announcements() to authenticated;

-- CREATE OR REPLACE يحفظ ملكية المحفّز ودالّة الإطفاء ومنحهما
notify pgrst, 'reload schema';
