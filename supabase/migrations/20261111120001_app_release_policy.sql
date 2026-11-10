-- ════════════════════════════════════════════════════════════════════
-- سياسة إصدارات المتجر: متى يُعرض «يتوفر تحديث»، ومتى يصير إلزاميًّا
--
-- التحديث اللاسلكيّ يغطّي الشيفرة وحدها. ما يمسّ الجزء الأصليّ (حزمة native،
-- إذن، ترقية SDK) لا يصل إلا بنسخةٍ جديدة من المتجر - فيحتاج المستخدم أن
-- يُخبَر ويُنقل إليها. هذه الأرقام يضبطها الأدمن بلا بناءٍ جديد:
--
--   latest_build  أحدث رقم بناء في المتجر: ما دونه يرى «يتوفر تحديث» (اختياريّ)
--   min_build     أدنى رقم مسموح: ما دونه يرى «يجب التحديث» ولا يستعمل التطبيق
--
-- ورقم البناء هو versionCode على أندرويد وbuildNumber على iOS، يرفعه EAS
-- تلقائيًّا مع كلّ بناء إنتاج (autoIncrement). الصفر = لا شيء يُعرض.
--
-- عامٌّ لا لكلّ محلّ: النسخة في المتجر واحدة لكلّ من ثبّت التطبيق.
-- ويُقرأ بعد الدخول لا قبله: مخطّط api مغلقٌ على anon كلّيًّا، وفتحه لأجل
-- رقمين لا يستحقّ. نسخةٌ قديمة تصل شاشة الدخول، ثم تُمنع بعده إن كان إلزاميًّا.
-- ════════════════════════════════════════════════════════════════════

create table if not exists core.app_release_policy (
    platform text NOT NULL,
    latest_build integer DEFAULT 0 NOT NULL,
    min_build integer DEFAULT 0 NOT NULL,
    ios_app_store_id text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT app_release_policy_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text]))),
    CONSTRAINT app_release_policy_builds_check CHECK (((min_build >= 0) AND (latest_build >= min_build))),
    CONSTRAINT app_release_policy_ios_id_check CHECK (((ios_app_store_id IS NULL) OR (ios_app_store_id ~ '^[0-9]{6,12}$'::text)))
);

alter table core.app_release_policy owner to postgres;

ALTER TABLE ONLY core.app_release_policy
    ADD CONSTRAINT app_release_policy_pkey PRIMARY KEY (platform);

-- لا سياسة ولا منح: الدالّتان وحدهما تقرآن وتكتبان
ALTER TABLE core.app_release_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.app_release_policy FORCE ROW LEVEL SECURITY;
revoke all on core.app_release_policy from public, anon, authenticated;

COMMENT ON TABLE core.app_release_policy IS 'سياسة إصدارات المتجر لكلّ منصّة: latest_build (ما دونه «يتوفر تحديث») وmin_build (ما دونه تحديثٌ إلزاميّ). يضبطها الأدمن، ويقرؤها التطبيق قبل الدخول.';

insert into core.app_release_policy (platform) values ('android'), ('ios')
on conflict (platform) do nothing;

-- ── القراءة: لكلّ مستخدمٍ داخل، وتعيد الأرقام وحدها ─────────────────

CREATE OR REPLACE FUNCTION api.app_release_policy(p_platform text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'latest_build', p.latest_build,
    'min_build', p.min_build,
    'ios_app_store_id', p.ios_app_store_id)
  from core.app_release_policy p
  where p.platform = p_platform;
$function$;

-- ── الضبط: للأدمن وحده ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION api.set_app_release_policy(p_platform text, p_latest_build integer, p_min_build integer, p_ios_app_store_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid; v_org uuid; v_ios text := nullif(btrim(coalesce(p_ios_app_store_id, '')), '');
begin
  v_uid := private.current_uid();
  if v_uid is null then
    raise exception 'غير مصادَق عليه.' using errcode = 'BD403';
  end if;
  v_org := private.current_org();
  if v_org is null or not private.is_admin(v_org) then
    raise exception 'إصدارات المتجر للأدمن وحده.' using errcode = 'BD403';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'المنصّة ios أو android.' using errcode = 'BD400';
  end if;
  if p_latest_build is null or p_min_build is null or p_min_build < 0 or p_latest_build < p_min_build then
    raise exception 'الحدّ الأدنى بين صفر وأحدث رقم بناء.' using errcode = 'BD400';
  end if;
  if v_ios is not null and v_ios !~ '^[0-9]{6,12}$' then
    raise exception 'معرّف App Store أرقامٌ فقط (كما في رابط التطبيق بعد id).' using errcode = 'BD400';
  end if;

  update core.app_release_policy
  set latest_build = p_latest_build, min_build = p_min_build,
      ios_app_store_id = case when p_platform = 'ios' then v_ios else ios_app_store_id end,
      updated_at = now(), updated_by = v_uid
  where platform = p_platform;

  insert into core.audit_logs (organization_id, actor_id, action, entity, entity_id, summary, payload)
  values (v_org, v_uid, 'settings.app_release', 'app_release_policy', p_platform,
          format('إصدارات %s: أحدث %s، أدنى %s', p_platform, p_latest_build, p_min_build),
          jsonb_build_object('platform', p_platform, 'latest_build', p_latest_build,
                             'min_build', p_min_build, 'ios_app_store_id', v_ios));

  return api.app_release_policy(p_platform);
end
$function$;

-- ── الملكية والمنح ───────────────────────────────────────────────────

grant select, update on core.app_release_policy to baytak_rpc_owner;

grant create on schema api to baytak_rpc_owner;
alter function api.app_release_policy(text) owner to baytak_rpc_owner;
alter function api.set_app_release_policy(text, integer, integer, text) owner to baytak_rpc_owner;
revoke create on schema api from baytak_rpc_owner;
revoke all on function api.app_release_policy(text) from public, anon;
revoke all on function api.set_app_release_policy(text, integer, integer, text) from public, anon;
grant execute on function api.app_release_policy(text) to authenticated;
grant execute on function api.set_app_release_policy(text, integer, integer, text) to authenticated;

notify pgrst, 'reload schema';
