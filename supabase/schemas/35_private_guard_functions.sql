-- ════════════════════════════════════════════════════════════════════
-- دوال الحُرّاس (تستدعيها triggers)
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION private.block_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'الجدول % دفتر أستاذ: لا تعديل ولا حذف. التصحيح بقيد معاكس.',
    TG_TABLE_NAME using errcode = '42501';
end $function$;

CREATE OR REPLACE FUNCTION private.block_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'لا حذف فعلي لـ%. استخدم الأرشفة (archived_at).', TG_TABLE_NAME
    using errcode = '42501';
end $function$;

CREATE OR REPLACE FUNCTION private.guard_project_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status_code is distinct from old.status_code and not private.in_rpc() then
    raise exception 'تغيير حالة المشروع يتم عبر RPC حصرًا (الحالية %، المطلوبة %)',
      old.status_code, new.status_code using errcode = '42501';
  end if;

  -- قفل تفاؤلي: كل تحديث يرفع النسخة، وأي كتابة بنسخة قديمة تُرفض
  if new.lock_version is not distinct from old.lock_version then
    new.lock_version := old.lock_version + 1;
  elsif new.lock_version <> old.lock_version + 1 then
    raise exception 'تعارض تعديل: المشروع عُدّل من جهة أخرى. أعد التحميل.'
      using errcode = '40001';
  end if;

  new.updated_at := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION private.guard_locked_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if old.locked then
    if new.subtotal_agorot   is distinct from old.subtotal_agorot
    or new.discount_percent  is distinct from old.discount_percent
    or new.discount_agorot   is distinct from old.discount_agorot
    or new.vat_agorot        is distinct from old.vat_agorot
    or new.total_agorot      is distinct from old.total_agorot
    or new.internal_cost_agorot is distinct from old.internal_cost_agorot
    or new.valid_until       is distinct from old.valid_until then
      raise exception 'النسخة % مقفلة: أنشئ نسخة جديدة بدل تعديلها.',
        old.version_number using errcode = '42501';
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION private.guard_locked_items()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_locked boolean;
begin
  select qv.locked into v_locked
  from core.quotation_versions qv
  where qv.id = coalesce(new.version_id, old.version_id);

  if v_locked then
    raise exception 'بنود نسخة مقفلة لا تُمس.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $function$;
