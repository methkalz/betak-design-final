-- ════════════════════════════════════════════════════════════════════
-- تفعيل RLS والسياسات (112) — بعد دوال private لأنها تستدعيها
-- مُولَّد من القاعدة الحية (pg_get_functiondef / pg_get_viewdef / pg_dump)
-- هذا الملف مصدر الحقيقة التصريحي. عدّله ثم ولّد migration بـ db diff.
-- ⚠️ الملكية والمنح و RLS لا يلتقطها db diff — مكانها migrations يدوية.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE ONLY core.attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.business_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.client_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.customers FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.projects FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.discount_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.fabric_products FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.fabric_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.fabric_rolls FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.fabric_variants FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.fabric_usage FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.movement_reasons FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.field_visits FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.movement_effects FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.stock_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.organization_members FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.pricing_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.project_statuses FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.rooms FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.windows FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.quotation_items FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.quotation_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.quotations FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.tailor_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.document_sequences FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY core.user_devices FORCE ROW LEVEL SECURITY;
CREATE POLICY "admin and sales schedule visits" ON core.field_visits FOR INSERT TO authenticated WITH CHECK (private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]));
CREATE POLICY "admin manages assignments" ON core.tailor_assignments TO authenticated USING (private.is_admin(organization_id)) WITH CHECK (private.is_admin(organization_id));
CREATE POLICY "admin reads audit log" ON core.audit_logs FOR SELECT TO authenticated USING (private.is_admin(organization_id));
CREATE POLICY "admin writes pricing" ON core.pricing_rules TO authenticated USING (private.is_admin(organization_id)) WITH CHECK (private.is_admin(organization_id));
CREATE POLICY "admin writes products" ON core.fabric_products TO authenticated USING (private.is_admin(organization_id)) WITH CHECK (private.is_admin(organization_id));
CREATE POLICY "admin writes rolls" ON core.fabric_rolls TO authenticated USING (private.is_admin(organization_id)) WITH CHECK (private.is_admin(organization_id));
CREATE POLICY "admin writes variants" ON core.fabric_variants TO authenticated USING (private.is_admin(organization_id)) WITH CHECK (private.is_admin(organization_id));
CREATE POLICY "anyone reads movement effects" ON core.movement_effects FOR SELECT TO authenticated USING (true);
CREATE POLICY "anyone reads movement reasons" ON core.movement_reasons FOR SELECT TO authenticated USING (true);
CREATE POLICY "anyone reads statuses" ON core.project_statuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "assignee updates own visit" ON core.field_visits FOR UPDATE TO authenticated USING ((assignee_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((assignee_id = ( SELECT auth.uid() AS uid)));
ALTER TABLE core.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.client_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.discount_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.document_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.fabric_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.fabric_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.fabric_rolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.fabric_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.fabric_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "field reads customers of own projects" ON core.customers FOR SELECT TO authenticated USING ((private.has_role(organization_id, ARRAY['field'::core.app_role]) AND (EXISTS ( SELECT 1
   FROM core.projects p
  WHERE ((p.customer_id = customers.id) AND (p.organization_id = customers.organization_id) AND private.can_see_project(p.organization_id, p.id))))));
ALTER TABLE core.field_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance roles read payments" ON core.payments FOR SELECT TO authenticated USING (private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]));
CREATE POLICY "measurement roles write rooms" ON core.rooms TO authenticated USING ((private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role, 'field'::core.app_role]) AND private.can_see_project(organization_id, project_id))) WITH CHECK ((private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role, 'field'::core.app_role]) AND private.can_see_project(organization_id, project_id)));
CREATE POLICY "measurement roles write windows" ON core.windows TO authenticated USING ((private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role, 'field'::core.app_role]) AND private.can_see_project(organization_id, project_id))) WITH CHECK ((private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role, 'field'::core.app_role]) AND private.can_see_project(organization_id, project_id)));
CREATE POLICY "members read colleagues" ON core.profiles FOR SELECT TO authenticated USING (((id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (core.organization_members mine
     JOIN core.organization_members theirs ON ((theirs.organization_id = mine.organization_id)))
  WHERE ((mine.user_id = ( SELECT auth.uid() AS uid)) AND mine.is_active AND (theirs.user_id = profiles.id))))));
CREATE POLICY "members read memberships" ON core.organization_members FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY "members read own organization" ON core.organizations FOR SELECT TO authenticated USING (private.is_org_member(id));
CREATE POLICY "members read products" ON core.fabric_products FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY "members read rolls" ON core.fabric_rolls FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY "members read settings" ON core.business_settings FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
CREATE POLICY "members read variants" ON core.fabric_variants FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
ALTER TABLE core.movement_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.movement_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing readable by pricing roles" ON core.pricing_rules FOR SELECT TO authenticated USING (private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]));
ALTER TABLE core.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.project_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.quotation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read attachments of visible projects" ON core.attachments FOR SELECT TO authenticated USING ((private.can_see_project(organization_id, project_id) AND ((kind <> 'check'::core.attachment_kind) OR private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]))));
CREATE POLICY "read own or managed visits" ON core.field_visits FOR SELECT TO authenticated USING (((assignee_id = ( SELECT auth.uid() AS uid)) OR private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role])));
CREATE POLICY "read rooms of visible projects" ON core.rooms FOR SELECT TO authenticated USING (private.can_see_project(organization_id, project_id));
CREATE POLICY "read visible projects" ON core.projects FOR SELECT TO authenticated USING (private.can_see_project(organization_id, id));
CREATE POLICY "read visible tailor assignments" ON core.tailor_assignments FOR SELECT TO authenticated USING (private.can_see_project(organization_id, project_id));
CREATE POLICY "read windows of visible projects" ON core.windows FOR SELECT TO authenticated USING (private.can_see_project(organization_id, project_id));
ALTER TABLE core.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales and admin create projects" ON core.projects FOR INSERT TO authenticated WITH CHECK (private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]));
CREATE POLICY "sales and admin read all customers" ON core.customers FOR SELECT TO authenticated USING (private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]));
CREATE POLICY "sales and admin update customers" ON core.customers FOR UPDATE TO authenticated USING (private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role])) WITH CHECK (private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]));
CREATE POLICY "sales and admin update projects" ON core.projects FOR UPDATE TO authenticated USING (private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role])) WITH CHECK (private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]));
CREATE POLICY "sales and admin write customers" ON core.customers FOR INSERT TO authenticated WITH CHECK (private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]));
CREATE POLICY "sales roles read discount requests" ON core.discount_requests FOR SELECT TO authenticated USING (private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]));
CREATE POLICY "sales roles read items" ON core.quotation_items FOR SELECT TO authenticated USING (private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]));
CREATE POLICY "sales roles read quotations" ON core.quotations FOR SELECT TO authenticated USING (private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]));
CREATE POLICY "sales roles read versions" ON core.quotation_versions FOR SELECT TO authenticated USING (private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]));
CREATE POLICY "stock roles read movements" ON core.stock_movements FOR SELECT TO authenticated USING (private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]));
CREATE POLICY "stock roles read reservations" ON core.fabric_reservations FOR SELECT TO authenticated USING (private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]));
CREATE POLICY "stock roles read usage" ON core.fabric_usage FOR SELECT TO authenticated USING (private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]));
ALTER TABLE core.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tailor advances own assignment" ON core.tailor_assignments FOR UPDATE TO authenticated USING (((tailor_id = ( SELECT auth.uid() AS uid)) AND private.has_role(organization_id, ARRAY['tailor'::core.app_role]))) WITH CHECK (((tailor_id = ( SELECT auth.uid() AS uid)) AND private.has_role(organization_id, ARRAY['tailor'::core.app_role])));
CREATE POLICY "tailor reads own usage" ON core.fabric_usage FOR SELECT TO authenticated USING ((private.has_role(organization_id, ARRAY['tailor'::core.app_role]) AND private.can_see_project(organization_id, project_id)));
CREATE POLICY "tailor reads reservations of own projects" ON core.fabric_reservations FOR SELECT TO authenticated USING ((private.has_role(organization_id, ARRAY['tailor'::core.app_role]) AND private.can_see_project(organization_id, project_id)));
ALTER TABLE core.tailor_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "upload to visible projects" ON core.attachments FOR INSERT TO authenticated WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND private.can_see_project(organization_id, project_id) AND ((kind <> 'check'::core.attachment_kind) OR private.has_role(organization_id, ARRAY['admin'::core.app_role, 'sales'::core.app_role]))));
CREATE POLICY "user manages own devices" ON core.user_devices TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND private.is_org_member(organization_id))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND private.is_org_member(organization_id)));
CREATE POLICY "user marks own notifications read" ON core.notifications FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "user reads own notifications" ON core.notifications FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "user reads own operations" ON core.client_operations FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "user updates own profile" ON core.profiles FOR UPDATE TO authenticated USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK ((id = ( SELECT auth.uid() AS uid)));
ALTER TABLE core.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.windows ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.staff_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.staff_ledger FORCE ROW LEVEL SECURITY;
-- الأدمن يرى الدفتر كله، والموظف قيوده هو - والكتابة عبر RPC حصرًا
CREATE POLICY staff_ledger_read ON core.staff_ledger FOR SELECT
  USING (private.has_role(organization_id, ARRAY['admin'::core.app_role])
         OR (staff_id = ( SELECT auth.uid() AS uid)));
