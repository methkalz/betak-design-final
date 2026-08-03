/**
 * Baytak Design — shared domain model.
 * Mirrors the documented Supabase `core` schema. Money is stored in agorot
 * (bigint on the server, number here), meters as numeric(12,3).
 */

export type Role = 'admin' | 'sales' | 'field' | 'tailor';

export type UUID = string;

export interface Organization {
  id: UUID;
  name: string;
  phone: string;
  address: string;
  vatPercent: number;
}

export interface Profile {
  id: UUID;
  organizationId: UUID;
  fullName: string;
  phone: string;
  role: Role;
  pin: string;
  title: string;
  isActive: boolean;
}

export interface Customer {
  id: UUID;
  organizationId: UUID;
  fullName: string;
  phone: string;
  city: string;
  address: string;
  notes: string;
  preferences: string[];
  createdAt: string;
  archivedAt: string | null;
}

export type ProjectStatus =
  | 'new_request'
  | 'awaiting_measurement'
  | 'measured'
  | 'quotation'
  | 'customer_approved'
  | 'fabric_allocated'
  | 'with_tailor'
  | 'ready_for_install'
  | 'installed'
  | 'completed';

export type Priority = 'low' | 'normal' | 'high';

export interface Project {
  id: UUID;
  organizationId: UUID;
  customerId: UUID;
  code: string;
  title: string;
  status: ProjectStatus;
  priority: Priority;
  fieldWorkerId: UUID | null;
  tailorId: UUID | null;
  measurementDate: string | null;
  installationDate: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  lockVersion: number;
}

export interface Room {
  id: UUID;
  organizationId: UUID;
  projectId: UUID;
  name: string;
  floor: string;
  sortOrder: number;
}

export type CurtainModel = 'wave' | 'pinch_pleat' | 'eyelet' | 'roman' | 'sheer_panel';
export type TrackType = 'ceiling_rail' | 'wall_rod' | 'motorized' | 'double_rail';

export interface WindowUnit {
  id: UUID;
  organizationId: UUID;
  projectId: UUID;
  roomId: UUID;
  name: string;
  widthCm: number;
  heightCm: number;
  model: CurtainModel;
  hasLining: boolean;
  track: TrackType;
  fullness: number;
  fabricVariantId: UUID | null;
  liningVariantId: UUID | null;
  quantity: number;
  notes: string;
  measuredAt: string | null;
  measuredBy: UUID | null;
}

export type FabricKind = 'crepe' | 'other' | 'lining';

export interface FabricProduct {
  id: UUID;
  organizationId: UUID;
  name: string;
  kind: FabricKind;
  supplier: string;
  widthCm: number;
  composition: string;
  imageUrl: string;
}

export interface FabricVariant {
  id: UUID;
  organizationId: UUID;
  productId: UUID;
  colorName: string;
  colorHex: string;
  sku: string;
  /** Internal wholesale cost per meter, in agorot. Hidden from field/tailor. */
  costPerMeterAgorot: number;
  imageUrl: string;
}

export interface FabricRoll {
  id: UUID;
  organizationId: UUID;
  variantId: UUID;
  code: string;
  dyeLot: string;
  location: string;
  initialMeters: number;
  isMiniRoll: boolean;
  createdAt: string;
}

export type MovementType =
  | 'receipt'
  | 'reservation'
  | 'reservation_release'
  | 'consumption'
  /** استهلاك يتجاوز المحجوز: يخفض on_hand و available، ولا يمس reserved.
   *  يُربط بحركة consumption المرافقة عبر operation_group_id. */
  | 'overconsumption'
  | 'return'
  | 'damage'
  /** تلف من كمية محجوزة: on_hand ↓ و reserved ↓ معًا، available ثابت.
   *  التلف ليس تحريرًا — لا يظهر في تقارير الكميات المحررة. */
  | 'damage_reserved'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'transfer_in'
  | 'transfer_out';

export interface StockMovement {
  id: UUID;
  organizationId: UUID;
  rollId: UUID;
  type: MovementType;
  /** Always positive. Direction is derived from `type`. */
  quantityM: number;
  projectId: UUID | null;
  reservationId: UUID | null;
  /** رمز سبب معتمد من قائمة movement_reasons — عليه تُبنى التقارير. */
  reasonCode?: string | null;
  /** نص حر. لا يُدمج بالرمز أبدًا — الدمج يفسد التجميع. */
  notes: string;
  createdBy: UUID;
  createdAt: string;
  idempotencyKey: string;
  /** يجمع حركات إجراء واحد (استهلاك + زيادة). يولَّد في الخادم حصرًا. */
  operationGroupId?: UUID | null;
  /** حركات return فقط: سجل الاستهلاك المُرجَع منه. الخادم يشتق منه الرول
   *  والحجز والمشروع — لا يُرسَل roll_id عند الإرجاع. */
  fabricUsageId?: UUID | null;
}

/** closed = انتهى الحجز محاسبيًا بمزيج نتائج أو بتلف — لا استُهلك كله ولا حُرِّر كله. */
export type ReservationStatus =
  | 'active'
  | 'partially_consumed'
  | 'consumed'
  | 'released'
  | 'closed';

export interface FabricReservation {
  id: UUID;
  organizationId: UUID;
  projectId: UUID;
  /** المحجوز الأصلي — ثابت لا يُنقص. الإنقاص عبر consumed/released/damaged. */
  rollId: UUID;
  quantityM: number;
  consumedM: number;
  /** المحرَّر تراكميًا. اختياري لتوافق البيانات المحفوظة قبل هذا الحقل. */
  releasedM?: number;
  /** التالف من المحجوز. invariant:
   *  quantityM = consumedM + releasedM + damagedReservedM + remaining */
  damagedReservedM?: number;
  status: ReservationStatus;
  createdBy: UUID;
  createdAt: string;
}

export interface FabricUsage {
  id: UUID;
  organizationId: UUID;
  projectId: UUID;
  reservationId: UUID;
  rollId: UUID;
  plannedM: number;
  actualM: number;
  wasteM: number;
  reasonCode?: string | null;
  notes: string;
  createdBy: UUID;
  createdAt: string;
}

export type HeightBand = 'standard' | 'tall';
export type PricingCategory =
  | 'crepe_with_lining'
  | 'crepe_without_lining'
  | 'other_without_lining'
  | 'other_with_lining';

export interface PricingRule {
  id: UUID;
  organizationId: UUID;
  band: HeightBand;
  category: PricingCategory;
  /** Customer price per running meter, in agorot. */
  customerPricePerMeterAgorot: number;
  /** Tailor wage per running meter, in agorot. */
  tailorCostPerMeterAgorot: number;
}

export interface BusinessSettings {
  organizationId: UUID;
  trackCostPerMeterAgorot: number;
  deliveryCostPerMeterAgorot: number;
  measureInstallCostPerMeterAgorot: number;
  liningCostPerMeterAgorot: number;
  minMarginPercent: number;
  employeeDiscountLimitPercent: number;
  adminDiscountLimitPercent: number;
  quotationValidityDays: number;
  vatPercent: number;
  currency: 'ILS';
}

export type QuotationStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'expired';

export interface Quotation {
  id: UUID;
  organizationId: UUID;
  projectId: UUID;
  number: string;
  status: QuotationStatus;
  currentVersionId: UUID;
  createdAt: string;
}

export interface QuotationItem {
  id: UUID;
  windowId: UUID | null;
  roomName: string;
  windowName: string;
  description: string;
  widthCm: number;
  heightCm: number;
  runningMeters: number;
  quantity: number;
  category: PricingCategory;
  band: HeightBand;
  unitPriceAgorot: number;
  lineTotalAgorot: number;
  /** Internal only — never rendered for field/tailor roles. */
  internalCostAgorot: number;
  fabricMeters: number;
  liningMeters: number;
}

export interface QuotationVersion {
  id: UUID;
  organizationId: UUID;
  quotationId: UUID;
  versionNumber: number;
  status: QuotationStatus;
  items: QuotationItem[];
  subtotalAgorot: number;
  discountPercent: number;
  discountAgorot: number;
  vatAgorot: number;
  totalAgorot: number;
  internalCostAgorot: number;
  marginPercent: number;
  validUntil: string;
  note: string;
  createdBy: UUID;
  createdAt: string;
  sentAt: string | null;
  approvedAt: string | null;
  /** Immutable once sent — a new version must be created instead. */
  locked: boolean;
}

export type DiscountRequestStatus = 'pending' | 'approved' | 'rejected';

export interface DiscountRequest {
  id: UUID;
  organizationId: UUID;
  quotationId: UUID;
  versionId: UUID;
  requestedPercent: number;
  reason: string;
  status: DiscountRequestStatus;
  requestedBy: UUID;
  decidedBy: UUID | null;
  decidedAt: string | null;
  createdAt: string;
}

export type TailorStage = 'received' | 'cutting' | 'sewing' | 'ironing' | 'qc' | 'ready';

export interface TailorAssignment {
  id: UUID;
  organizationId: UUID;
  projectId: UUID;
  tailorId: UUID;
  stage: TailorStage;
  instructions: string;
  dueDate: string;
  startedAt: string | null;
  completedAt: string | null;
  stageHistory: { stage: TailorStage; at: string }[];
}

export type VisitType = 'measurement' | 'installation';
export type VisitStatus = 'scheduled' | 'in_progress' | 'completed';

export interface InstallationChecklist {
  track: boolean;
  curtain: boolean;
  height: boolean;
  cleanliness: boolean;
}

export interface FieldVisit {
  id: UUID;
  organizationId: UUID;
  projectId: UUID;
  assigneeId: UUID;
  type: VisitType;
  status: VisitStatus;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  notes: string;
  checklist: InstallationChecklist;
  customerSignedOff: boolean;
}

export type PaymentMethod = 'cash' | 'transfer' | 'check' | 'card';
export type PaymentKind = 'deposit' | 'milestone' | 'final' | 'reversal';

export interface Payment {
  id: UUID;
  organizationId: UUID;
  projectId: UUID;
  amountAgorot: number;
  kind: PaymentKind;
  method: PaymentMethod;
  reference: string;
  note: string;
  reversedPaymentId: UUID | null;
  createdBy: UUID;
  createdAt: string;
}

export type AttachmentKind =
  | 'measurement'
  | 'before_install'
  | 'after_install'
  | 'fabric'
  | 'document';

export interface Attachment {
  id: UUID;
  organizationId: UUID;
  projectId: UUID;
  roomId: UUID | null;
  windowId: UUID | null;
  visitId: UUID | null;
  kind: AttachmentKind;
  uri: string;
  caption: string;
  createdBy: UUID;
  createdAt: string;
  /** Local-first: photos live on device until the upload queue drains. */
  uploaded: boolean;
}

export type NotificationKind =
  | 'discount_request'
  | 'tailor_assignment'
  | 'visit_assigned'
  | 'ready_for_install'
  | 'appointment_tomorrow'
  | 'sync_failed'
  | 'low_stock'
  | 'payment';

export interface AppNotification {
  id: UUID;
  organizationId: UUID;
  userId: UUID;
  kind: NotificationKind;
  title: string;
  body: string;
  deepLink: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: UUID;
  organizationId: UUID;
  actorId: UUID;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  createdAt: string;
}

export type SyncState = 'saved_local' | 'pending' | 'syncing' | 'synced' | 'failed' | 'needs_review';

export interface ClientOperation {
  id: UUID;
  clientOperationId: UUID;
  idempotencyKey: string;
  kind: string;
  label: string;
  entityId: string;
  state: SyncState;
  attempts: number;
  error: string | null;
  createdAt: string;
  syncedAt: string | null;
}
