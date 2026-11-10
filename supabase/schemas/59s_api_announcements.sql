-- ════════════════════════════════════════════════════════════════════
-- الإشعار العامّ: إرسالٌ من الأدمن إلى الطاقم، وسجلّ ما أُرسل وما وصل
-- مرآة الترحيل 20261110120001_announcements.sql - النصّ نفسه حرفيًّا.
-- ⚠️ الملكية والمنح لا يلتقطها db diff — مكانها الترحيل.
-- ════════════════════════════════════════════════════════════════════

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
