/**
 * الوضع الحي — شريحة الربط الأولى (قراءة).
 *
 * يجلب قاعدة التطبيق كاملة من views سكيما api عبر Kong ويصبّها في نفس شكل
 * `Database` المحلي، فتعمل كل الشاشات بلا تعديل. الصلاحيات حقيقية من RLS:
 * المحجوب ماليًا لا تصله views التكاليف أصلًا فتُصفَّر حقولها هنا.
 *
 * الكتابة إلى الخادم (RPC) شريحةٌ تالية — هذه الشريحة قراءة موثوقة + دخول
 * حقيقي + جلسات مشفرة.
 */
import type { Database } from '@/data/seed';
import { supabase } from '@/lib/supabase';
import type {
  BusinessSettings,
  Customer,
  DiscountRequest,
  FabricProduct,
  FabricReservation,
  FabricRoll,
  FabricUsage,
  FabricVariant,
  Organization,
  PricingRule,
  Profile,
  Project,
  Quotation,
  QuotationItem,
  QuotationVersion,
  Room,
  StockMovement,
  WindowUnit,
} from '@/types/domain';

type Row = Record<string, unknown>;
const s = (v: unknown): string => (v == null ? '' : String(v));
const sOrNull = (v: unknown): string | null => (v == null ? null : String(v));
const n = (v: unknown): number => (v == null ? 0 : Number(v));

export interface LiveIdentity {
  userId: string;
  organizationId: string;
  fullName: string;
  role: Profile['role'];
}

async function select(view: string): Promise<Row[]> {
  const { data, error } = await supabase.from(view).select('*');
  if (error) throw new Error(`${view}: ${error.message}`);
  return (data ?? []) as Row[];
}

/** view مالية مقيّدة بالدور — الفشل أو الفراغ يعني «محجوب» لا خطأ. */
async function selectPrivileged(view: string): Promise<Row[]> {
  const { data, error } = await supabase.from(view).select('*');
  if (error) return [];
  return (data ?? []) as Row[];
}

export async function fetchIdentity(): Promise<LiveIdentity> {
  const { data, error } = await supabase.from('me').select('*').single();
  if (error || !data) {
    throw new Error('حسابك غير مربوط بأي معرض نشط - راجع الأدمن.');
  }
  const row = data as Row;
  return {
    userId: s(row.user_id),
    organizationId: s(row.organization_id),
    fullName: s(row.full_name),
    role: s(row.role) as Profile['role'],
  };
}

export async function fetchLiveDatabase(): Promise<{ db: Database; me: LiveIdentity }> {
  const me = await fetchIdentity();

  const [
    orgRows, settingsRows, members, customers, projects, rooms, windows,
    products, variants, rolls, movements, reservations, usages,
    rules, quotations, versions, items, discounts,
    settingsCosts, variantCosts, versionFin, itemFin,
  ] = await Promise.all([
    select('organization'), select('business_settings'), select('team_members'),
    select('customers'), select('projects'), select('rooms'), select('windows'),
    select('fabric_products'), select('fabric_variants'), select('fabric_rolls'),
    select('stock_movements'), select('fabric_reservations'), select('fabric_usage'),
    select('pricing_rules'), select('quotations'), select('quotation_versions'),
    select('quotation_items'), select('discount_requests'),
    selectPrivileged('business_settings_costs'),
    selectPrivileged('fabric_variant_costs'),
    selectPrivileged('quotation_version_financials'),
    selectPrivileged('quotation_item_financials'),
  ]);

  const org = orgRows[0] ?? {};
  const st = settingsRows[0] ?? {};
  const stCosts = settingsCosts[0] ?? {};

  const organization: Organization = {
    id: s(org.organization_id),
    name: s(org.name),
    phone: s(org.phone),
    address: s(org.address),
    vatPercent: n(st.vat_percent),
  };

  const settings: BusinessSettings = {
    organizationId: s(st.organization_id),
    trackCostPerMeterAgorot: n(stCosts.track_cost_per_meter_agorot),
    deliveryCostPerMeterAgorot: n(stCosts.delivery_cost_per_meter_agorot),
    measureInstallCostPerMeterAgorot: n(stCosts.measure_install_cost_per_meter_agorot),
    liningCostPerMeterAgorot: n(stCosts.lining_cost_per_meter_agorot),
    minMarginPercent: n(st.min_margin_percent),
    employeeDiscountLimitPercent: n(st.employee_discount_limit_percent),
    adminDiscountLimitPercent: n(st.admin_discount_limit_percent),
    quotationValidityDays: n(st.quotation_validity_days),
    vatPercent: n(st.vat_percent),
    currency: 'ILS',
    // عمود أجرة الزيارة يصل الخادم مع شريحة الكتابة
    fieldVisitWageAgorot: n(st.field_visit_wage_agorot),
  };

  const profiles: Profile[] = members.map((m) => ({
    id: s(m.user_id),
    organizationId: s(m.organization_id),
    fullName: s(m.full_name),
    phone: s(m.phone),
    role: s(m.role) as Profile['role'],
    pin: '',
    title: s(m.title),
    isActive: Boolean(m.is_active),
  }));

  const customersMapped: Customer[] = customers.map((c) => ({
    id: s(c.customer_id),
    organizationId: s(c.organization_id),
    fullName: s(c.full_name),
    phone: s(c.phone),
    city: s(c.city),
    address: s(c.address),
    notes: s(c.notes),
    preferences: Array.isArray(c.preferences) ? (c.preferences as string[]) : [],
    createdAt: s(c.created_at),
    archivedAt: sOrNull(c.archived_at),
  }));

  const projectsMapped: Project[] = projects
    .filter((p) => p.archived_at == null)
    .map((p) => ({
      id: s(p.project_id),
      organizationId: s(p.organization_id),
      customerId: s(p.customer_id),
      code: s(p.code),
      title: s(p.title),
      status: s(p.status_code) as Project['status'],
      priority: s(p.priority) as Project['priority'],
      // القياس والتركيب عمودان منفصلان على الخادم مع شريحة الكتابة
      measurementWorkerId: sOrNull(p.measurement_worker_id ?? p.field_worker_id),
      installerId: sOrNull(p.installer_id),
      tailorId: sOrNull(p.tailor_id),
      measurementDate: sOrNull(p.measurement_date),
      installationDate: sOrNull(p.installation_date),
      notes: s(p.notes),
      createdAt: s(p.created_at),
      updatedAt: s(p.updated_at),
      lockVersion: n(p.lock_version),
    }));

  const roomsMapped: Room[] = rooms.map((r) => ({
    id: s(r.room_id),
    organizationId: s(r.organization_id),
    projectId: s(r.project_id),
    name: s(r.name),
    floor: s(r.floor),
    sortOrder: n(r.sort_order),
  }));

  const windowsMapped: WindowUnit[] = windows.map((w) => ({
    id: s(w.window_id),
    organizationId: s(w.organization_id),
    projectId: s(w.project_id),
    roomId: s(w.room_id),
    name: s(w.name),
    widthCm: n(w.width_cm),
    heightCm: n(w.height_cm),
    model: s(w.model) as WindowUnit['model'],
    hasLining: Boolean(w.has_lining),
    track: s(w.track) as WindowUnit['track'],
    fullness: n(w.fullness),
    fabricVariantId: sOrNull(w.fabric_variant_id),
    liningVariantId: sOrNull(w.lining_variant_id),
    quantity: n(w.quantity),
    notes: s(w.notes),
    measuredAt: sOrNull(w.measured_at),
    measuredBy: sOrNull(w.measured_by),
  }));

  const productsMapped: FabricProduct[] = products.map((p) => ({
    id: s(p.product_id),
    organizationId: s(p.organization_id),
    name: s(p.name),
    kind: s(p.kind) as FabricProduct['kind'],
    supplier: s(p.supplier),
    widthCm: n(p.width_cm),
    composition: s(p.composition),
    imageUrl: s(p.image_url),
  }));

  const costByVariant = new Map<string, number>(
    variantCosts.map((v) => [s(v.variant_id), n(v.cost_per_meter_agorot)]),
  );
  const variantsMapped: FabricVariant[] = variants.map((v) => ({
    id: s(v.variant_id),
    organizationId: s(v.organization_id),
    productId: s(v.product_id),
    colorName: s(v.color_name),
    colorHex: s(v.color_hex),
    sku: s(v.sku),
    costPerMeterAgorot: costByVariant.get(s(v.variant_id)) ?? 0,
    imageUrl: s(v.image_url),
  }));

  const rollsMapped: FabricRoll[] = rolls.map((r) => ({
    id: s(r.roll_id),
    organizationId: s(r.organization_id),
    variantId: s(r.variant_id),
    code: s(r.code),
    dyeLot: s(r.dye_lot),
    location: s(r.location),
    initialMeters: n(r.initial_meters),
    isMiniRoll: Boolean(r.is_mini_roll),
    // عمود الإسناد للخياط يصل الخادم مع شريحة الكتابة
    assignedTailorId: r.assigned_tailor_id ? s(r.assigned_tailor_id) : null,
    createdAt: s(r.created_at),
  }));

  const movementsMapped: StockMovement[] = movements.map((m) => ({
    id: s(m.movement_id),
    organizationId: s(m.organization_id),
    rollId: s(m.roll_id),
    type: s(m.type) as StockMovement['type'],
    quantityM: n(m.quantity_m),
    projectId: sOrNull(m.project_id),
    reservationId: sOrNull(m.reservation_id),
    reasonCode: sOrNull(m.reason_code),
    notes: s(m.notes),
    createdBy: s(m.created_by),
    createdAt: s(m.created_at),
    idempotencyKey: '',
    operationGroupId: sOrNull(m.operation_group_id),
    fabricUsageId: sOrNull(m.fabric_usage_id),
  }));

  const reservationsMapped: FabricReservation[] = reservations.map((r) => ({
    id: s(r.reservation_id),
    organizationId: s(r.organization_id),
    projectId: s(r.project_id),
    rollId: s(r.roll_id),
    quantityM: n(r.quantity_m),
    consumedM: n(r.consumed_m),
    releasedM: n(r.released_m),
    damagedReservedM: n(r.damaged_reserved_m),
    status: s(r.status) as FabricReservation['status'],
    createdBy: s(r.created_by),
    createdAt: s(r.created_at),
  }));

  const usagesMapped: FabricUsage[] = usages.map((u) => ({
    id: s(u.usage_id),
    organizationId: s(u.organization_id),
    projectId: s(u.project_id),
    // الخادم لا يحمل هذا العمود بعد - يُضاف مع شريحة الكتابة
    windowId: u.window_id ? s(u.window_id) : null,
    reservationId: s(u.reservation_id),
    rollId: s(u.roll_id),
    plannedM: n(u.planned_m),
    actualM: n(u.actual_m),
    wasteM: n(u.waste_m),
    reasonCode: sOrNull(u.reason_code),
    notes: s(u.notes),
    createdBy: s(u.created_by),
    createdAt: s(u.created_at),
  }));

  const rulesMapped: PricingRule[] = rules.map((r) => ({
    id: s(r.rule_id),
    organizationId: s(r.organization_id),
    band: s(r.band) as PricingRule['band'],
    category: s(r.category) as PricingRule['category'],
    customerPricePerMeterAgorot: n(r.customer_price_per_meter_agorot),
    tailorCostPerMeterAgorot: n(r.tailor_cost_per_meter_agorot),
  }));

  const quotationsMapped: Quotation[] = quotations.map((q) => ({
    id: s(q.quotation_id),
    organizationId: s(q.organization_id),
    projectId: s(q.project_id),
    number: s(q.number),
    status: s(q.status) as Quotation['status'],
    currentVersionId: s(q.current_version_id),
    createdAt: s(q.created_at),
  }));

  const itemFinById = new Map<string, Row>(itemFin.map((f) => [s(f.item_id), f]));
  const itemsByVersion = new Map<string, QuotationItem[]>();
  for (const i of items) {
    const fin = itemFinById.get(s(i.item_id));
    const mapped: QuotationItem = {
      id: s(i.item_id),
      windowId: sOrNull(i.window_id),
      roomName: s(i.room_name),
      windowName: s(i.window_name),
      description: s(i.description),
      widthCm: n(i.width_cm),
      heightCm: n(i.height_cm),
      runningMeters: n(i.running_meters),
      quantity: n(i.quantity),
      category: s(i.category) as QuotationItem['category'],
      band: s(i.band) as QuotationItem['band'],
      unitPriceAgorot: n(i.unit_price_agorot),
      lineTotalAgorot: n(i.line_total_agorot),
      internalCostAgorot: fin ? n(fin.internal_cost_agorot) : 0,
      fabricMeters: n(i.fabric_meters),
      liningMeters: n(i.lining_meters),
    };
    const key = s(i.version_id);
    const list = itemsByVersion.get(key) ?? [];
    list.push(mapped);
    itemsByVersion.set(key, list);
  }

  const verFinById = new Map<string, Row>(versionFin.map((f) => [s(f.version_id), f]));
  const versionsMapped: QuotationVersion[] = versions.map((v) => {
    const fin = verFinById.get(s(v.version_id));
    return {
      id: s(v.version_id),
      organizationId: s(v.organization_id),
      quotationId: s(v.quotation_id),
      versionNumber: n(v.version_number),
      status: s(v.status) as QuotationVersion['status'],
      items: itemsByVersion.get(s(v.version_id)) ?? [],
      subtotalAgorot: n(v.subtotal_agorot),
      discountPercent: n(v.discount_percent),
      discountAgorot: n(v.discount_agorot),
      vatAgorot: n(v.vat_agorot),
      totalAgorot: n(v.total_agorot),
      internalCostAgorot: fin ? n(fin.internal_cost_agorot) : 0,
      marginPercent: fin ? n(fin.margin_percent) : 0,
      validUntil: s(v.valid_until),
      note: s(v.note),
      createdBy: s(v.created_by),
      createdAt: s(v.created_at),
      sentAt: sOrNull(v.sent_at),
      approvedAt: sOrNull(v.approved_at),
      locked: Boolean(v.locked),
      rejectedAt: sOrNull(v.rejected_at),
      supersededAt: sOrNull(v.superseded_at),
      sentBy: sOrNull(v.sent_by),
      decisionRecordedBy: sOrNull(v.decision_recorded_by),
      decisionNote: s(v.decision_note),
      effectiveStatus: s(v.effective_status) as QuotationVersion['status'],
    };
  });

  const discountsMapped: DiscountRequest[] = discounts.map((d) => ({
    id: s(d.request_id),
    organizationId: s(d.organization_id),
    quotationId: s(d.quotation_id),
    versionId: s(d.version_id),
    requestedPercent: n(d.requested_percent),
    reason: s(d.reason),
    status: s(d.status) as DiscountRequest['status'],
    requestedBy: s(d.requested_by),
    decidedBy: sOrNull(d.decided_by),
    decidedAt: sOrNull(d.decided_at),
    createdAt: s(d.created_at),
  }));

  const db: Database = {
    organization,
    settings,
    profiles,
    customers: customersMapped,
    projects: projectsMapped,
    rooms: roomsMapped,
    windows: windowsMapped,
    fabricProducts: productsMapped,
    fabricVariants: variantsMapped,
    fabricRolls: rollsMapped,
    stockMovements: movementsMapped,
    reservations: reservationsMapped,
    usages: usagesMapped,
    pricingRules: rulesMapped,
    quotations: quotationsMapped,
    quotationVersions: versionsMapped,
    discountRequests: discountsMapped,
    // خارج نطاق الشريحة الأولى — الشاشات تعرض حالاتها الفارغة المصممة أصلًا
    tailorAssignments: [],
    fieldVisits: [],
    payments: [],
    staffLedger: [],
    attachments: [],
    notifications: [],
    auditLogs: [],
    operations: [],
  };

  return { db, me };
}
