-- ════════════════════════════════════════════════════════════════════
-- الـtriggers (8)
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

CREATE TRIGGER audit_logs_immutable BEFORE DELETE OR UPDATE ON core.audit_logs FOR EACH ROW EXECUTE FUNCTION private.block_mutation();
CREATE TRIGGER customers_no_delete BEFORE DELETE ON core.customers FOR EACH ROW EXECUTE FUNCTION private.block_delete();
CREATE TRIGGER payments_immutable BEFORE DELETE OR UPDATE ON core.payments FOR EACH ROW EXECUTE FUNCTION private.block_mutation();
CREATE TRIGGER projects_guard BEFORE UPDATE ON core.projects FOR EACH ROW EXECUTE FUNCTION private.guard_project_update();
CREATE TRIGGER projects_no_delete BEFORE DELETE ON core.projects FOR EACH ROW EXECUTE FUNCTION private.block_delete();
CREATE TRIGGER quotation_items_guard BEFORE INSERT OR DELETE OR UPDATE ON core.quotation_items FOR EACH ROW EXECUTE FUNCTION private.guard_locked_items();
CREATE TRIGGER quotation_versions_guard BEFORE UPDATE ON core.quotation_versions FOR EACH ROW EXECUTE FUNCTION private.guard_locked_version();
CREATE TRIGGER stock_movements_immutable BEFORE DELETE OR UPDATE ON core.stock_movements FOR EACH ROW EXECUTE FUNCTION private.block_mutation();
